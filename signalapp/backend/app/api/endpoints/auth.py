from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_password_hash, verify_password, create_access_token
from app.core.rate_limit import security_guard, get_real_client_ip
from app.models.user import User, UserRole
from app.schemas.user import UserCreate, UserLogin, Token, UserResponse
from app.api.deps import get_current_user

router = APIRouter()

# Precomputed dummy hash to prevent timing attack enumeration for non-existent emails
_DUMMY_HASH = "$2b$12$e8xOq5/Xv3O6mFvIqXJ25uC5o8J0fNqJ5J0fNqJ5J0fNqJ5J0fNqJ"

@router.post("/register", response_model=UserResponse)
def register(user_in: UserCreate, request: Request, db: Session = Depends(get_db)):
    client_ip = get_real_client_ip(request)
    existing = db.query(User).filter(User.email == user_in.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists"
        )
    user = User(
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password),
        full_name=user_in.full_name,
        role=UserRole.USER.value,
        timezone=user_in.timezone or "Africa/Nairobi",
        account_currency=user_in.account_currency or "USD"
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@router.post("/login", response_model=Token)
def login_json(credentials: UserLogin, request: Request, db: Session = Depends(get_db)):
    client_ip = get_real_client_ip(request)
    email = credentials.email.strip().lower() if credentials.email else ""

    # Check account-specific lockout (locks out target email after 5 consecutive bad passwords)
    acc_ok, retry_after, lock_msg = security_guard.check_account_lockout(email)
    if not acc_ok:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=lock_msg,
            headers={"Retry-After": str(retry_after)}
        )

    user = db.query(User).filter(User.email == credentials.email).first()
    target_hash = user.hashed_password if user else _DUMMY_HASH
    is_valid_pwd = verify_password(credentials.password, target_hash)

    if not user or not is_valid_pwd:
        security_guard.record_login_failure(email, client_ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user account")
    
    # Successful login — clear failed attempt count
    security_guard.record_login_success(email, client_ip)

    token = create_access_token(subject=user.id, role=user.role)
    return Token(
        access_token=token,
        token_type="bearer",
        role=user.role,
        user_id=user.id,
        email=user.email,
        full_name=user.full_name
    )

@router.post("/token", response_model=Token)
def login_oauth2(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    client_ip = get_real_client_ip(request)
    email = form_data.username.strip().lower() if form_data.username else ""

    # Check account-specific lockout
    acc_ok, retry_after, lock_msg = security_guard.check_account_lockout(email)
    if not acc_ok:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=lock_msg,
            headers={"Retry-After": str(retry_after)}
        )

    user = db.query(User).filter(User.email == form_data.username).first()
    target_hash = user.hashed_password if user else _DUMMY_HASH
    is_valid_pwd = verify_password(form_data.password, target_hash)

    if not user or not is_valid_pwd:
        security_guard.record_login_failure(email, client_ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"}
        )

    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user account")

    # Successful login — clear failed attempt count
    security_guard.record_login_success(email, client_ip)

    token = create_access_token(subject=user.id, role=user.role)
    return Token(
        access_token=token,
        token_type="bearer",
        role=user.role,
        user_id=user.id,
        email=user.email,
        full_name=user.full_name
    )

@router.get("/me", response_model=UserResponse)
def read_current_user(current_user: User = Depends(get_current_user)):
    return current_user
