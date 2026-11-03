from datetime import datetime, timedelta, timezone

import pytest


def auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.anyio
async def test_health_and_authentication(client, admin_token):
    assert (await client.get("/health")).json()["status"] == "ok"
    assert (await client.get("/api/v1/auth/me")).status_code == 401
    response = await client.get("/api/v1/auth/me", headers=auth(admin_token))
    assert response.json()["email"] == "admin@test.local"


@pytest.mark.anyio
async def test_login_rejects_wrong_password(client):
    response = await client.post("/api/v1/auth/login", json={"email": "admin@test.local", "password": "wrong"})
    assert response.status_code == 401


@pytest.mark.anyio
async def test_patient_registration_and_search(client, admin_token):
    response = await client.post("/api/v1/patients", headers=auth(admin_token), json={
        "full_name": "New Test Patient", "date_of_birth": "2001-05-10", "sex": "Female",
        "phone": "555-0100", "email": "new@example.com", "allergies": "None recorded",
    })
    assert response.status_code == 201
    patient = response.json()
    assert patient["medical_record_number"].startswith("CF-")
    results = await client.get("/api/v1/patients?q=New%20Test", headers=auth(admin_token))
    assert results.json()[0]["id"] == patient["id"]


@pytest.mark.anyio
async def test_appointment_to_encounter_to_chart_context(client, admin_token):
    appointment = await client.post("/api/v1/appointments", headers=auth(admin_token), json={
        "patient_id": 1, "provider_id": 1, "scheduled_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(), "reason": "Follow-up",
    })
    assert appointment.status_code == 201
    encounter = await client.post("/api/v1/encounters", headers=auth(admin_token), json={
        "patient_id": 1, "provider_id": 1, "appointment_id": appointment.json()["id"],
        "chief_complaint": "Routine follow-up", "clinician_assessment": "Clinician-authored assessment",
        "plan": "Clinician-authored plan", "vitals": {"heart_rate": 72},
    })
    assert encounter.status_code == 201
    appointments = await client.get("/api/v1/appointments", headers=auth(admin_token))
    assert appointments.json()[0]["status"] == "completed"
    summary = await client.get("/api/v1/patients/1/care-summary", headers=auth(admin_token))
    assert summary.json()["recent_encounter"]["chief_complaint"] == "Routine follow-up"
    assert "does not diagnose" in summary.json()["notice"]


@pytest.mark.anyio
async def test_lab_and_pharmacy_workflow(client, admin_token):
    lab = await client.post("/api/v1/labs", headers=auth(admin_token), json={"patient_id": 1, "test_name": "CBC"})
    assert lab.status_code == 201
    completed = await client.patch(f"/api/v1/labs/{lab.json()['id']}", headers=auth(admin_token), json={"status": "completed", "result": "Demo result"})
    assert completed.json()["status"] == "completed"
    stock = await client.patch("/api/v1/medications/1/stock", headers=auth(admin_token), json={"quantity_on_hand": 8})
    assert stock.status_code == 200
    assert stock.json()["quantity_on_hand"] == 8


@pytest.mark.anyio
async def test_invoice_creation_and_payment(client, admin_token):
    invoice = await client.post("/api/v1/invoices", headers=auth(admin_token), json={
        "patient_id": 1,
        "lines": [{"description": "Consultation", "quantity": 2, "unit_price": "650.00"}],
    })
    assert invoice.status_code == 201
    assert invoice.json()["total"] == "1300.00"
    paid = await client.patch(f"/api/v1/invoices/{invoice.json()['id']}/pay", headers=auth(admin_token))
    assert paid.status_code == 200
    assert paid.json()["status"] == "paid"


@pytest.mark.anyio
async def test_role_scope_blocks_pharmacy_from_clinical_notes(client):
    login = await client.post("/api/v1/auth/login", json={"email": "pharmacy@test.local", "password": "SecureTest123!"})
    token = login.json()["access_token"]
    assert (await client.get("/api/v1/encounters", headers=auth(token))).status_code == 403
    assert (await client.get("/api/v1/medications", headers=auth(token))).status_code == 200
