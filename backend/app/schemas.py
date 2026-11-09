from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class UserOut(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    role: str
    model_config = ConfigDict(from_attributes=True)


class StaffUserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=160)
    password: str = Field(min_length=12, max_length=128)
    role: Literal["admin", "reception", "clinician", "lab", "pharmacy", "billing", "patient"]
    patient_id: int | None = None

    @field_validator("password")
    @classmethod
    def strong_password(cls, value: str) -> str:
        if not any(char.isalpha() for char in value) or not any(char.isdigit() for char in value):
            raise ValueError("Password must include at least one letter and one number")
        return value


class StaffUserOut(UserOut):
    patient_id: int | None = None
    active: bool
    created_at: datetime


class StaffActiveUpdate(BaseModel):
    active: bool


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)

    @field_validator("new_password")
    @classmethod
    def strong_password(cls, value: str) -> str:
        if not any(char.isalpha() for char in value) or not any(char.isdigit() for char in value):
            raise ValueError("Password must include at least one letter and one number")
        return value


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class PatientCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=160)
    date_of_birth: date
    sex: str = "Not specified"
    phone: str = ""
    email: str = ""
    address: str = ""
    blood_group: str = "Unknown"
    allergies: str = "None recorded"


class PatientOut(BaseModel):
    id: int
    medical_record_number: str
    full_name: str
    date_of_birth: date
    sex: str
    phone: str
    email: str
    address: str
    blood_group: str
    allergies: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ProviderOut(BaseModel):
    id: int
    full_name: str
    specialty: str
    department: str
    active: bool
    model_config = ConfigDict(from_attributes=True)


class AppointmentCreate(BaseModel):
    patient_id: int
    provider_id: int
    scheduled_at: datetime
    reason: str = Field(min_length=2, max_length=240)


class AppointmentStatusUpdate(BaseModel):
    status: str
    notes: str = ""


class AppointmentOut(BaseModel):
    id: int
    patient_id: int
    provider_id: int
    scheduled_at: datetime
    reason: str
    status: str
    notes: str
    patient_name: str = ""
    provider_name: str = ""


class EncounterCreate(BaseModel):
    patient_id: int
    provider_id: int
    appointment_id: int | None = None
    chief_complaint: str = Field(min_length=2, max_length=500)
    clinician_notes: str = ""
    clinician_assessment: str = ""
    plan: str = ""
    vitals: dict[str, Any] = Field(default_factory=dict)


class EncounterOut(BaseModel):
    id: int
    patient_id: int
    provider_id: int
    appointment_id: int | None
    chief_complaint: str
    clinician_notes: str
    clinician_assessment: str
    plan: str
    vitals: dict[str, Any]
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class LabOrderCreate(BaseModel):
    patient_id: int
    encounter_id: int | None = None
    test_name: str = Field(min_length=2, max_length=160)


class LabResultUpdate(BaseModel):
    status: str
    result: str = ""


class LabOrderOut(BaseModel):
    id: int
    patient_id: int
    encounter_id: int | None
    test_name: str
    status: str
    result: str
    ordered_at: datetime
    completed_at: datetime | None
    model_config = ConfigDict(from_attributes=True)


class MedicationCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    strength: str = ""
    quantity_on_hand: int = Field(ge=0)
    reorder_level: int = Field(default=10, ge=0)
    unit_price: Decimal = Field(default=Decimal("0.00"), ge=0)


class StockUpdate(BaseModel):
    quantity_on_hand: int = Field(ge=0)


class MedicationOut(BaseModel):
    id: int
    name: str
    strength: str
    quantity_on_hand: int
    reorder_level: int
    unit_price: Decimal
    active: bool
    model_config = ConfigDict(from_attributes=True)


class PrescriptionCreate(BaseModel):
    patient_id: int
    encounter_id: int
    medication_id: int
    dosage: str = Field(min_length=1, max_length=120)
    frequency: str = Field(min_length=1, max_length=120)
    duration_days: int = Field(ge=1, le=365)


class DispenseUpdate(BaseModel):
    status: str = "dispensed"


class PrescriptionOut(BaseModel):
    id: int
    patient_id: int
    encounter_id: int
    provider_id: int
    medication_id: int
    dosage: str
    frequency: str
    duration_days: int
    status: str
    created_at: datetime
    medication_name: str = ""
    patient_name: str = ""


class InvoiceLineCreate(BaseModel):
    description: str = Field(min_length=2, max_length=240)
    quantity: int = Field(ge=1, le=10000)
    unit_price: Decimal = Field(ge=0)


class InvoiceCreate(BaseModel):
    patient_id: int
    encounter_id: int | None = None
    lines: list[InvoiceLineCreate] = Field(min_length=1)


class InvoiceLineOut(BaseModel):
    id: int
    description: str
    quantity: int
    unit_price: Decimal
    model_config = ConfigDict(from_attributes=True)


class InvoiceOut(BaseModel):
    id: int
    patient_id: int
    encounter_id: int | None
    status: str
    currency: str
    created_at: datetime
    paid_at: datetime | None
    total: Decimal
    patient_name: str = ""
    lines: list[InvoiceLineOut]


class CareSummaryOut(BaseModel):
    patient_id: int
    medical_record_number: str
    patient_name: str
    allergies: str
    recent_encounter: dict[str, Any] | None
    active_prescriptions: list[dict[str, Any]]
    pending_labs: list[dict[str, Any]]
    generated_at: datetime
    notice: str
