from contextlib import asynccontextmanager
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Annotated, Callable
from uuid import uuid4

import jwt
from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import Base, SessionLocal, engine, get_db, init_schema
from app.models import (
    Appointment,
    AuditLog,
    Encounter,
    Invoice,
    InvoiceLine,
    LabOrder,
    Medication,
    Patient,
    Prescription,
    Provider,
    User,
    utcnow,
)
from app.schemas import (
    AppointmentCreate,
    AppointmentOut,
    AppointmentStatusUpdate,
    CareSummaryOut,
    DispenseUpdate,
    EncounterCreate,
    EncounterOut,
    InvoiceCreate,
    InvoiceOut,
    LabOrderCreate,
    LabOrderOut,
    LabResultUpdate,
    LoginRequest,
    MedicationCreate,
    MedicationOut,
    PatientCreate,
    PatientOut,
    PrescriptionCreate,
    PrescriptionOut,
    ProviderOut,
    StockUpdate,
    TokenOut,
    UserOut,
)
from app.security import create_access_token, hash_password, verify_password


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_schema()
    if settings.seed_demo_data:
        seed_demo_data()
    yield


app = FastAPI(
    title=settings.app_name,
    description="Role-scoped hospital operations API. Demo data is synthetic.",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH"],
    allow_headers=["Authorization", "Content-Type"],
)

bearer = HTTPBearer(auto_error=False)
DbDep = Annotated[Session, Depends(get_db)]


def current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    db: DbDep,
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Sign in to continue",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise unauthorized
    try:
        payload = jwt.decode(credentials.credentials, settings.secret_key, algorithms=["HS256"])
        email = payload.get("sub")
        if not email:
            raise unauthorized
    except jwt.PyJWTError as exc:
        raise unauthorized from exc
    user = db.scalar(select(User).where(User.email == email, User.active.is_(True)))
    if user is None:
        raise unauthorized
    return user


def require_roles(*roles: str) -> Callable:
    def dependency(user: Annotated[User, Depends(current_user)]) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Your account cannot perform this action")
        return user

    return dependency


def audit(db: Session, user: User, action: str, entity_type: str, entity_id: int | None, detail: str = "") -> None:
    db.add(AuditLog(user_id=user.id, action=action, entity_type=entity_type, entity_id=entity_id, detail=detail[:300]))


def ensure_patient(db: Session, patient_id: int) -> Patient:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


def ensure_provider(db: Session, provider_id: int) -> Provider:
    provider = db.get(Provider, provider_id)
    if provider is None or not provider.active:
        raise HTTPException(status_code=404, detail="Provider not found")
    return provider


def appointment_view(db: Session, item: Appointment) -> dict:
    patient = db.get(Patient, item.patient_id)
    provider = db.get(Provider, item.provider_id)
    return {
        "id": item.id,
        "patient_id": item.patient_id,
        "provider_id": item.provider_id,
        "scheduled_at": item.scheduled_at,
        "reason": item.reason,
        "status": item.status,
        "notes": item.notes,
        "patient_name": patient.full_name if patient else "Unknown patient",
        "provider_name": provider.full_name if provider else "Unknown provider",
    }


def prescription_view(db: Session, item: Prescription) -> dict:
    patient = db.get(Patient, item.patient_id)
    medication = db.get(Medication, item.medication_id)
    return {
        "id": item.id,
        "patient_id": item.patient_id,
        "encounter_id": item.encounter_id,
        "provider_id": item.provider_id,
        "medication_id": item.medication_id,
        "dosage": item.dosage,
        "frequency": item.frequency,
        "duration_days": item.duration_days,
        "status": item.status,
        "created_at": item.created_at,
        "medication_name": f"{medication.name} {medication.strength}".strip() if medication else "Unknown medication",
        "patient_name": patient.full_name if patient else "Unknown patient",
    }


def invoice_view(db: Session, item: Invoice) -> dict:
    lines = db.scalars(select(InvoiceLine).where(InvoiceLine.invoice_id == item.id).order_by(InvoiceLine.id)).all()
    patient = db.get(Patient, item.patient_id)
    total = sum((line.unit_price * line.quantity for line in lines), Decimal("0.00"))
    return {
        "id": item.id,
        "patient_id": item.patient_id,
        "encounter_id": item.encounter_id,
        "status": item.status,
        "currency": item.currency,
        "created_at": item.created_at,
        "paid_at": item.paid_at,
        "total": total,
        "patient_name": patient.full_name if patient else "Unknown patient",
        "lines": lines,
    }


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok", "service": "careflow-api"}


@app.post("/api/v1/auth/login", response_model=TokenOut, tags=["authentication"])
def login(payload: LoginRequest, db: DbDep) -> dict:
    user = db.scalar(select(User).where(User.email == payload.email.lower(), User.active.is_(True)))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email or password is incorrect")
    return {"access_token": create_access_token(user.email), "user": user}


@app.get("/api/v1/auth/me", response_model=UserOut, tags=["authentication"])
def me(user: Annotated[User, Depends(current_user)]) -> User:
    return user


@app.get("/api/v1/providers", response_model=list[ProviderOut], tags=["appointments"])
def list_providers(db: DbDep, _: Annotated[User, Depends(current_user)]) -> list[Provider]:
    return list(db.scalars(select(Provider).where(Provider.active.is_(True)).order_by(Provider.full_name)).all())


@app.get("/api/v1/patients", response_model=list[PatientOut], tags=["patients"])
def list_patients(
    db: DbDep,
    _: Annotated[User, Depends(require_roles("admin", "reception", "clinician", "billing"))],
    q: str = Query(default="", max_length=120),
    limit: int = Query(default=100, ge=1, le=250),
) -> list[Patient]:
    statement = select(Patient)
    if q.strip():
        search = f"%{q.strip()}%"
        statement = statement.where(
            (Patient.full_name.ilike(search)) | (Patient.medical_record_number.ilike(search)) | (Patient.phone.ilike(search))
        )
    return list(db.scalars(statement.order_by(Patient.full_name).limit(limit)).all())


@app.post("/api/v1/patients", response_model=PatientOut, status_code=201, tags=["patients"])
def create_patient(
    payload: PatientCreate,
    db: DbDep,
    user: Annotated[User, Depends(require_roles("admin", "reception"))],
) -> Patient:
    if payload.date_of_birth > date.today():
        raise HTTPException(status_code=422, detail="Date of birth cannot be in the future")
    patient = Patient(medical_record_number=f"CF-{uuid4().hex[:8].upper()}", **payload.model_dump())
    db.add(patient)
    db.flush()
    audit(db, user, "patient.created", "patient", patient.id)
    db.commit()
    db.refresh(patient)
    return patient


@app.get("/api/v1/patients/{patient_id}", response_model=PatientOut, tags=["patients"])
def get_patient(
    patient_id: int,
    db: DbDep,
    _: Annotated[User, Depends(require_roles("admin", "reception", "clinician", "billing"))],
) -> Patient:
    return ensure_patient(db, patient_id)


@app.get("/api/v1/appointments", response_model=list[AppointmentOut], tags=["appointments"])
def list_appointments(
    db: DbDep,
    _: Annotated[User, Depends(require_roles("admin", "reception", "clinician"))],
    day: date | None = None,
) -> list[dict]:
    statement = select(Appointment)
    if day:
        start = datetime.combine(day, time.min).replace(tzinfo=timezone.utc)
        statement = statement.where(Appointment.scheduled_at >= start, Appointment.scheduled_at < start + timedelta(days=1))
    items = db.scalars(statement.order_by(Appointment.scheduled_at).limit(250)).all()
    return [appointment_view(db, item) for item in items]


@app.post("/api/v1/appointments", response_model=AppointmentOut, status_code=201, tags=["appointments"])
def create_appointment(
    payload: AppointmentCreate,
    db: DbDep,
    user: Annotated[User, Depends(require_roles("admin", "reception", "clinician"))],
) -> dict:
    ensure_patient(db, payload.patient_id)
    ensure_provider(db, payload.provider_id)
    appointment = Appointment(**payload.model_dump(), status="scheduled")
    db.add(appointment)
    db.flush()
    audit(db, user, "appointment.created", "appointment", appointment.id)
    db.commit()
    db.refresh(appointment)
    return appointment_view(db, appointment)


@app.patch("/api/v1/appointments/{appointment_id}", response_model=AppointmentOut, tags=["appointments"])
def update_appointment(
    appointment_id: int,
    payload: AppointmentStatusUpdate,
    db: DbDep,
    user: Annotated[User, Depends(require_roles("admin", "reception", "clinician"))],
) -> dict:
    allowed = {"scheduled", "confirmed", "checked_in", "completed", "cancelled"}
    if payload.status not in allowed:
        raise HTTPException(status_code=422, detail=f"Status must be one of: {', '.join(sorted(allowed))}")
    appointment = db.get(Appointment, appointment_id)
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")
    appointment.status = payload.status
    appointment.notes = payload.notes
    audit(db, user, "appointment.updated", "appointment", appointment.id, payload.status)
    db.commit()
    db.refresh(appointment)
    return appointment_view(db, appointment)


@app.get("/api/v1/encounters", response_model=list[EncounterOut], tags=["clinical records"])
def list_encounters(
    db: DbDep,
    _: Annotated[User, Depends(require_roles("admin", "clinician"))],
    patient_id: int | None = None,
) -> list[Encounter]:
    statement = select(Encounter)
    if patient_id:
        statement = statement.where(Encounter.patient_id == patient_id)
    return list(db.scalars(statement.order_by(Encounter.created_at.desc()).limit(100)).all())


@app.post("/api/v1/encounters", response_model=EncounterOut, status_code=201, tags=["clinical records"])
def create_encounter(
    payload: EncounterCreate,
    db: DbDep,
    user: Annotated[User, Depends(require_roles("admin", "clinician"))],
) -> Encounter:
    ensure_patient(db, payload.patient_id)
    ensure_provider(db, payload.provider_id)
    encounter = Encounter(**payload.model_dump())
    db.add(encounter)
    db.flush()
    if encounter.appointment_id:
        appointment = db.get(Appointment, encounter.appointment_id)
        if appointment is None or appointment.patient_id != encounter.patient_id:
            db.rollback()
            raise HTTPException(status_code=422, detail="Appointment must belong to this patient")
        appointment.status = "completed"
    audit(db, user, "encounter.created", "encounter", encounter.id)
    db.commit()
    db.refresh(encounter)
    return encounter


@app.get("/api/v1/labs", response_model=list[LabOrderOut], tags=["laboratory"])
def list_labs(
    db: DbDep,
    _: Annotated[User, Depends(require_roles("admin", "clinician", "lab"))],
    status_filter: str | None = Query(default=None, alias="status"),
) -> list[LabOrder]:
    statement = select(LabOrder)
    if status_filter:
        statement = statement.where(LabOrder.status == status_filter)
    return list(db.scalars(statement.order_by(LabOrder.ordered_at.desc()).limit(250)).all())


@app.post("/api/v1/labs", response_model=LabOrderOut, status_code=201, tags=["laboratory"])
def create_lab_order(
    payload: LabOrderCreate,
    db: DbDep,
    user: Annotated[User, Depends(require_roles("admin", "clinician"))],
) -> LabOrder:
    ensure_patient(db, payload.patient_id)
    order = LabOrder(**payload.model_dump())
    db.add(order)
    db.flush()
    audit(db, user, "lab.created", "lab_order", order.id, order.test_name)
    db.commit()
    db.refresh(order)
    return order


@app.patch("/api/v1/labs/{order_id}", response_model=LabOrderOut, tags=["laboratory"])
def update_lab_order(
    order_id: int,
    payload: LabResultUpdate,
    db: DbDep,
    user: Annotated[User, Depends(require_roles("admin", "clinician", "lab"))],
) -> LabOrder:
    if payload.status not in {"pending", "processing", "completed", "cancelled"}:
        raise HTTPException(status_code=422, detail="Unsupported lab status")
    order = db.get(LabOrder, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Lab order not found")
    order.status = payload.status
    order.result = payload.result
    order.completed_at = utcnow() if payload.status == "completed" else None
    audit(db, user, "lab.updated", "lab_order", order.id, payload.status)
    db.commit()
    db.refresh(order)
    return order


@app.get("/api/v1/medications", response_model=list[MedicationOut], tags=["pharmacy"])
def list_medications(
    db: DbDep,
    _: Annotated[User, Depends(require_roles("admin", "clinician", "pharmacy"))],
) -> list[Medication]:
    return list(db.scalars(select(Medication).where(Medication.active.is_(True)).order_by(Medication.name)).all())


@app.post("/api/v1/medications", response_model=MedicationOut, status_code=201, tags=["pharmacy"])
def create_medication(
    payload: MedicationCreate,
    db: DbDep,
    user: Annotated[User, Depends(require_roles("admin", "pharmacy"))],
) -> Medication:
    medication = Medication(**payload.model_dump())
    db.add(medication)
    db.flush()
    audit(db, user, "medication.created", "medication", medication.id, medication.name)
    db.commit()
    db.refresh(medication)
    return medication


@app.patch("/api/v1/medications/{medication_id}/stock", response_model=MedicationOut, tags=["pharmacy"])
def update_stock(
    medication_id: int,
    payload: StockUpdate,
    db: DbDep,
    user: Annotated[User, Depends(require_roles("admin", "pharmacy"))],
) -> Medication:
    medication = db.get(Medication, medication_id)
    if not medication:
        raise HTTPException(status_code=404, detail="Medication not found")
    medication.quantity_on_hand = payload.quantity_on_hand
    audit(db, user, "medication.stock_updated", "medication", medication.id, str(payload.quantity_on_hand))
    db.commit()
    db.refresh(medication)
    return medication


@app.get("/api/v1/prescriptions", response_model=list[PrescriptionOut], tags=["pharmacy"])
def list_prescriptions(
    db: DbDep,
    _: Annotated[User, Depends(require_roles("admin", "clinician", "pharmacy"))],
) -> list[dict]:
    items = db.scalars(select(Prescription).order_by(Prescription.created_at.desc()).limit(250)).all()
    return [prescription_view(db, item) for item in items]


@app.post("/api/v1/prescriptions", response_model=PrescriptionOut, status_code=201, tags=["pharmacy"])
def create_prescription(
    payload: PrescriptionCreate,
    db: DbDep,
    user: Annotated[User, Depends(require_roles("admin", "clinician"))],
) -> dict:
    ensure_patient(db, payload.patient_id)
    encounter = db.get(Encounter, payload.encounter_id)
    medication = db.get(Medication, payload.medication_id)
    if encounter is None or encounter.patient_id != payload.patient_id:
        raise HTTPException(status_code=422, detail="Encounter must belong to this patient")
    if medication is None or not medication.active:
        raise HTTPException(status_code=404, detail="Medication not found")
    prescription = Prescription(
        **payload.model_dump(),
        provider_id=encounter.provider_id,
        status="active",
    )
    db.add(prescription)
    db.flush()
    audit(db, user, "prescription.created", "prescription", prescription.id)
    db.commit()
    db.refresh(prescription)
    return prescription_view(db, prescription)


@app.patch("/api/v1/prescriptions/{prescription_id}/dispense", response_model=PrescriptionOut, tags=["pharmacy"])
def dispense_prescription(
    prescription_id: int,
    payload: DispenseUpdate,
    db: DbDep,
    user: Annotated[User, Depends(require_roles("admin", "pharmacy"))],
) -> dict:
    if payload.status not in {"dispensed", "cancelled"}:
        raise HTTPException(status_code=422, detail="Status must be dispensed or cancelled")
    prescription = db.get(Prescription, prescription_id)
    if not prescription or prescription.status != "active":
        raise HTTPException(status_code=404, detail="Active prescription not found")
    if payload.status == "dispensed":
        medication = db.get(Medication, prescription.medication_id)
        if medication.quantity_on_hand < 1:
            raise HTTPException(status_code=409, detail="Medication is out of stock")
        medication.quantity_on_hand -= 1
    prescription.status = payload.status
    audit(db, user, "prescription.dispensed", "prescription", prescription.id, payload.status)
    db.commit()
    db.refresh(prescription)
    return prescription_view(db, prescription)


@app.get("/api/v1/invoices", response_model=list[InvoiceOut], tags=["billing"])
def list_invoices(
    db: DbDep,
    _: Annotated[User, Depends(require_roles("admin", "billing"))],
    status_filter: str | None = Query(default=None, alias="status"),
) -> list[dict]:
    statement = select(Invoice)
    if status_filter:
        statement = statement.where(Invoice.status == status_filter)
    invoices = db.scalars(statement.order_by(Invoice.created_at.desc()).limit(250)).all()
    return [invoice_view(db, item) for item in invoices]


@app.post("/api/v1/invoices", response_model=InvoiceOut, status_code=201, tags=["billing"])
def create_invoice(
    payload: InvoiceCreate,
    db: DbDep,
    user: Annotated[User, Depends(require_roles("admin", "billing"))],
) -> dict:
    ensure_patient(db, payload.patient_id)
    invoice = Invoice(patient_id=payload.patient_id, encounter_id=payload.encounter_id, currency=settings.currency)
    db.add(invoice)
    db.flush()
    for line in payload.lines:
        db.add(InvoiceLine(invoice_id=invoice.id, **line.model_dump()))
    audit(db, user, "invoice.created", "invoice", invoice.id)
    db.commit()
    db.refresh(invoice)
    return invoice_view(db, invoice)


@app.patch("/api/v1/invoices/{invoice_id}/pay", response_model=InvoiceOut, tags=["billing"])
def pay_invoice(
    invoice_id: int,
    db: DbDep,
    user: Annotated[User, Depends(require_roles("admin", "billing"))],
) -> dict:
    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if invoice.status != "open":
        raise HTTPException(status_code=409, detail="Only open invoices can be marked paid")
    invoice.status = "paid"
    invoice.paid_at = utcnow()
    audit(db, user, "invoice.paid", "invoice", invoice.id)
    db.commit()
    db.refresh(invoice)
    return invoice_view(db, invoice)


@app.get("/api/v1/analytics/summary", tags=["analytics"])
def analytics_summary(
    db: DbDep,
    _: Annotated[User, Depends(require_roles("admin", "clinician", "billing"))],
) -> dict:
    now = datetime.now(timezone.utc)
    start = datetime.combine(now.date(), time.min).replace(tzinfo=timezone.utc)
    tomorrow = start + timedelta(days=1)
    patients = db.scalar(select(func.count(Patient.id))) or 0
    appointments_today = db.scalar(
        select(func.count(Appointment.id)).where(Appointment.scheduled_at >= start, Appointment.scheduled_at < tomorrow)
    ) or 0
    pending_labs = db.scalar(select(func.count(LabOrder.id)).where(LabOrder.status.in_(["pending", "processing"]))) or 0
    low_stock = db.scalar(
        select(func.count(Medication.id)).where(Medication.active.is_(True), Medication.quantity_on_hand <= Medication.reorder_level)
    ) or 0
    open_invoices = db.scalars(select(Invoice).where(Invoice.status == "open")).all()
    outstanding = sum(
        (db.scalar(select(func.coalesce(func.sum(InvoiceLine.unit_price * InvoiceLine.quantity), 0)).where(InvoiceLine.invoice_id == invoice.id)) or 0)
        for invoice in open_invoices
    )
    appointments = db.scalars(select(Appointment).order_by(Appointment.scheduled_at.desc()).limit(6)).all()
    departments = db.execute(
        select(Provider.department, func.count(Appointment.id))
        .join(Appointment, Appointment.provider_id == Provider.id)
        .group_by(Provider.department)
        .order_by(func.count(Appointment.id).desc())
    ).all()
    return {
        "patients_total": patients,
        "appointments_today": appointments_today,
        "pending_labs": pending_labs,
        "low_stock_count": low_stock,
        "outstanding_balance": str(outstanding),
        "currency": settings.currency,
        "recent_appointments": [appointment_view(db, item) for item in appointments],
        "department_activity": [{"department": department, "appointments": count} for department, count in departments],
    }


@app.get("/api/v1/patients/{patient_id}/care-summary", response_model=CareSummaryOut, tags=["clinical support"])
def care_summary(
    patient_id: int,
    db: DbDep,
    _: Annotated[User, Depends(require_roles("admin", "clinician"))],
) -> dict:
    patient = ensure_patient(db, patient_id)
    encounter = db.scalar(
        select(Encounter).where(Encounter.patient_id == patient_id).order_by(Encounter.created_at.desc()).limit(1)
    )
    prescriptions = db.scalars(
        select(Prescription).where(Prescription.patient_id == patient_id, Prescription.status == "active").order_by(Prescription.created_at.desc())
    ).all()
    labs = db.scalars(
        select(LabOrder).where(LabOrder.patient_id == patient_id, LabOrder.status.in_(["pending", "processing"])).order_by(LabOrder.ordered_at.desc())
    ).all()
    recent = None
    if encounter:
        recent = {
            "encounter_id": encounter.id,
            "date": encounter.created_at.isoformat(),
            "chief_complaint": encounter.chief_complaint,
            "clinician_assessment": encounter.clinician_assessment,
            "plan": encounter.plan,
            "vitals": encounter.vitals,
        }
    return {
        "patient_id": patient.id,
        "medical_record_number": patient.medical_record_number,
        "patient_name": patient.full_name,
        "allergies": patient.allergies,
        "recent_encounter": recent,
        "active_prescriptions": [
            {"prescription_id": item.id, "medication": prescription_view(db, item)["medication_name"], "dosage": item.dosage,
             "frequency": item.frequency, "duration_days": item.duration_days}
            for item in prescriptions
        ],
        "pending_labs": [{"lab_id": item.id, "test_name": item.test_name, "status": item.status} for item in labs],
        "generated_at": utcnow(),
        "notice": "Draft chart context assembled from recorded data only. It does not diagnose, recommend treatment, or replace clinician review.",
    }


@app.get("/api/v1/audit", tags=["administration"])
def list_audit_logs(
    db: DbDep,
    _: Annotated[User, Depends(require_roles("admin"))],
    limit: int = Query(default=100, ge=1, le=500),
) -> list[dict]:
    logs = db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)).all()
    return [
        {"id": item.id, "user_id": item.user_id, "action": item.action, "entity_type": item.entity_type,
         "entity_id": item.entity_id, "detail": item.detail, "created_at": item.created_at}
        for item in logs
    ]


def seed_demo_data() -> None:
    with SessionLocal() as db:
        if db.scalar(select(User.id).limit(1)):
            return
        admin = User(email=settings.admin_email.lower(), full_name="CareFlow Admin", password_hash=hash_password(settings.admin_password), role="admin")
        db.add(admin)
        providers = [
            Provider(full_name="Dr. Maya Iyer", specialty="Cardiology", department="Cardiology"),
            Provider(full_name="Dr. Arjun Mehta", specialty="General Medicine", department="Internal Medicine"),
            Provider(full_name="Dr. Leena Thomas", specialty="Pediatrics", department="Pediatrics"),
            Provider(full_name="Dr. Nikhil Rao", specialty="Orthopedics", department="Orthopedics"),
        ]
        db.add_all(providers)
        patients = [
            Patient(medical_record_number="CF-100241", full_name="Aarav Sharma", date_of_birth=date(1988, 4, 12), sex="Male", phone="+91 90000 10001", email="aarav.demo@example.test", address="Demo address", blood_group="O+", allergies="No known allergies"),
            Patient(medical_record_number="CF-100242", full_name="Diya Patel", date_of_birth=date(1994, 9, 3), sex="Female", phone="+91 90000 10002", email="diya.demo@example.test", address="Demo address", blood_group="B+", allergies="Penicillin (reported)"),
            Patient(medical_record_number="CF-100243", full_name="Kabir Singh", date_of_birth=date(1976, 1, 28), sex="Male", phone="+91 90000 10003", email="kabir.demo@example.test", address="Demo address", blood_group="A+", allergies="None recorded"),
            Patient(medical_record_number="CF-100244", full_name="Anaya Rao", date_of_birth=date(2012, 7, 19), sex="Female", phone="+91 90000 10004", email="anaya.demo@example.test", address="Demo address", blood_group="AB+", allergies="Seasonal pollen (reported)"),
        ]
        db.add_all(patients)
        medications = [
            Medication(name="Paracetamol", strength="500 mg", quantity_on_hand=124, reorder_level=30, unit_price=Decimal("2.50")),
            Medication(name="Amoxicillin", strength="250 mg", quantity_on_hand=18, reorder_level=25, unit_price=Decimal("8.00")),
            Medication(name="Cetirizine", strength="10 mg", quantity_on_hand=76, reorder_level=20, unit_price=Decimal("3.00")),
            Medication(name="Saline solution", strength="500 ml", quantity_on_hand=9, reorder_level=12, unit_price=Decimal("45.00")),
            Medication(name="Omeprazole", strength="20 mg", quantity_on_hand=64, reorder_level=15, unit_price=Decimal("4.00")),
        ]
        db.add_all(medications)
        db.flush()
        today = datetime.now(timezone.utc).date()
        start = datetime.combine(today, time(9, 0), tzinfo=timezone.utc)
        appts = [
            Appointment(patient_id=patients[0].id, provider_id=providers[0].id, scheduled_at=start + timedelta(hours=0), reason="Follow-up consultation", status="confirmed"),
            Appointment(patient_id=patients[1].id, provider_id=providers[1].id, scheduled_at=start + timedelta(hours=1), reason="General check-up", status="checked_in"),
            Appointment(patient_id=patients[2].id, provider_id=providers[3].id, scheduled_at=start + timedelta(hours=2), reason="Knee pain review", status="scheduled"),
            Appointment(patient_id=patients[3].id, provider_id=providers[2].id, scheduled_at=start + timedelta(days=1), reason="Pediatric wellness visit", status="scheduled"),
        ]
        db.add_all(appts)
        db.flush()
        encounter = Encounter(
            patient_id=patients[0].id,
            provider_id=providers[0].id,
            appointment_id=appts[0].id,
            chief_complaint="Routine follow-up",
            clinician_notes="Synthetic demo note. Review patient-reported symptoms and medication list.",
            clinician_assessment="Assessment entered by demo clinician.",
            plan="Follow-up plan entered by demo clinician.",
            vitals={"blood_pressure": "122/78", "heart_rate": 74, "temperature_c": 36.8, "oxygen_saturation": 98},
        )
        db.add(encounter)
        db.flush()
        db.add_all([
            LabOrder(patient_id=patients[0].id, encounter_id=encounter.id, test_name="Complete blood count", status="processing"),
            LabOrder(patient_id=patients[1].id, test_name="Lipid profile", status="pending"),
        ])
        invoice = Invoice(patient_id=patients[0].id, encounter_id=encounter.id, currency=settings.currency, status="open")
        db.add(invoice)
        db.flush()
        db.add_all([
            InvoiceLine(invoice_id=invoice.id, description="Consultation", quantity=1, unit_price=Decimal("650.00")),
            InvoiceLine(invoice_id=invoice.id, description="Complete blood count", quantity=1, unit_price=Decimal("350.00")),
        ])
        db.commit()

