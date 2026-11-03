import os
from datetime import date
from decimal import Decimal

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["SECRET_KEY"] = "automated-test-secret-for-isolated-database"
os.environ["SEED_DEMO_DATA"] = "false"

import pytest
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import Medication, Patient, Provider, User
from app.security import hash_password

test_engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestSession = sessionmaker(bind=test_engine, autoflush=False, autocommit=False, expire_on_commit=False)


def override_db():
    db = TestSession()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_db


@pytest.fixture(autouse=True)
def clean_database():
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    with TestSession() as db:
        db.add_all([
            User(email="admin@test.local", full_name="Test Admin", password_hash=hash_password("SecureTest123!"), role="admin"),
            User(email="pharmacy@test.local", full_name="Test Pharmacy", password_hash=hash_password("SecureTest123!"), role="pharmacy"),
        ])
        db.add(Provider(full_name="Dr. Test Provider", specialty="General Medicine", department="Internal Medicine"))
        db.add(Patient(
            medical_record_number="CF-TEST01", full_name="Test Patient", date_of_birth=date(1990, 1, 1),
            sex="Not specified", phone="", email="", address="", blood_group="Unknown", allergies="None recorded",
        ))
        db.add(Medication(name="Test medication", strength="10 mg", quantity_on_hand=20, reorder_level=5, unit_price=Decimal("4.00")))
        db.commit()
    yield


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client(anyio_backend):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as test_client:
        yield test_client


@pytest.fixture
async def admin_token(client):
    response = await client.post("/api/v1/auth/login", json={"email": "admin@test.local", "password": "SecureTest123!"})
    assert response.status_code == 200
    return response.json()["access_token"]
