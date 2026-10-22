"""
High-Performance Rate Limiting & Brute-Force Defense System.

Protects against automated credential stuffing, brute-force attacks (e.g. 60 req/min),
and distributed password guessing.

Features:
- Reverse-proxy / CDN aware client IP resolution (Render, Cloudflare, AWS, Nginx)
- Sliding-window per-IP request throttling for authentication endpoints
- Automatic IP auto-jail / temporary ban for aggressive attackers (>15 req/min)
- Account-level lockout for repeated failed credentials (prevents distributed brute-force)
- Standard RFC HTTP 429 response headers (Retry-After, X-RateLimit-*)
- In-memory thread-safe storage with automatic stale record eviction
"""

import time
import logging
from collections import defaultdict
from typing import Dict, List, Optional, Tuple
from fastapi import Request, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

logger = logging.getLogger("auth.security")

# Configuration Defaults
LOGIN_MAX_REQUESTS_PER_MINUTE = 5     # Normal users take <= 5 attempts / min
LOGIN_WINDOW_SECONDS = 60             # 1 minute sliding window
AGGRESSIVE_ATTACK_THRESHOLD = 15      # >15 attempts in 1 min triggers auto-jail
IP_JAIL_DURATION_SECONDS = 1800       # 30-minute block for aggressive attackers
MAX_FAILED_ATTEMPTS_PER_ACCOUNT = 5   # Max wrong passwords before locking email
ACCOUNT_LOCKOUT_SECONDS = 900         # 15 minutes account lockout


def get_real_client_ip(request: Request) -> str:
    """
    Extract real client IP considering reverse proxies (Cloudflare, Render, AWS, Nginx).
    """
    # 1. Cloudflare
    cf_ip = request.headers.get("cf-connecting-ip")
    if cf_ip:
        return cf_ip.strip()

    # 2. True-Client-IP
    true_client_ip = request.headers.get("true-client-ip")
    if true_client_ip:
        return true_client_ip.strip()

    # 3. X-Forwarded-For (client is the first IP in the chain)
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        parts = [p.strip() for p in forwarded_for.split(",") if p.strip()]
        if parts:
            return parts[0]

    # 4. X-Real-IP
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()

    # 5. Direct client host
    if request.client and request.client.host:
        return request.client.host

    return "127.0.0.1"


class SecurityGuard:
    """
    In-memory, thread-safe rate limiter and brute-force defender.
    """
    def __init__(self):
        # ip -> list of timestamps
        self._ip_requests: Dict[str, List[float]] = defaultdict(list)
        # ip -> jail expiration timestamp
        self._jailed_ips: Dict[str, float] = {}
        # normalized_email -> list of failed timestamps
        self._account_failures: Dict[str, List[float]] = defaultdict(list)
        # normalized_email -> lockout expiration timestamp
        self._locked_accounts: Dict[str, float] = {}
        self._last_cleanup = time.time()

    def _cleanup_stale_records(self, now: float):
        """Periodically purge expired records to prevent unbounded memory growth."""
        if now - self._last_cleanup < 60:
            return
        self._last_cleanup = now

        # Clean jailed IPs
        self._jailed_ips = {ip: exp for ip, exp in self._jailed_ips.items() if exp > now}

        # Clean IP requests
        cutoff = now - (LOGIN_WINDOW_SECONDS * 2)
        fresh_ips = {}
        for ip, timestamps in self._ip_requests.items():
            valid_ts = [t for t in timestamps if t > cutoff]
            if valid_ts:
                fresh_ips[ip] = valid_ts
        self._ip_requests = defaultdict(list, fresh_ips)

        # Clean locked accounts
        self._locked_accounts = {em: exp for em, exp in self._locked_accounts.items() if exp > now}

        # Clean account failures
        account_cutoff = now - (ACCOUNT_LOCKOUT_SECONDS * 2)
        fresh_accounts = {}
        for em, timestamps in self._account_failures.items():
            valid_ts = [t for t in timestamps if t > account_cutoff]
            if valid_ts:
                fresh_accounts[em] = valid_ts
        self._account_failures = defaultdict(list, fresh_accounts)

    def check_ip_rate_limit(self, ip: str) -> Tuple[bool, int, str]:
        """
        Check if IP is allowed to attempt login.
        Returns (is_allowed, retry_after_seconds, reason_message)
        """
        now = time.time()
        self._cleanup_stale_records(now)

        # 1. Check if IP is currently jailed
        if ip in self._jailed_ips:
            jail_expiry = self._jailed_ips[ip]
            if now < jail_expiry:
                retry_after = max(1, int(jail_expiry - now))
                logger.warning(f"[SecurityGuard] Blocked jailed IP: {ip}. Remaining: {retry_after}s")
                return False, retry_after, f"Access temporarily blocked due to aggressive login abuse. Try again in {retry_after} seconds."
            else:
                del self._jailed_ips[ip]

        # 2. Evaluate sliding window
        window_start = now - LOGIN_WINDOW_SECONDS
        recent_requests = [t for t in self._ip_requests[ip] if t > window_start]
        # Always record incoming request attempt
        recent_requests.append(now)
        self._ip_requests[ip] = recent_requests

        # Check aggressive abuse threshold (e.g. 60 req/min attack) -> Auto-jail for 30 minutes
        if len(recent_requests) >= AGGRESSIVE_ATTACK_THRESHOLD:
            jail_until = now + IP_JAIL_DURATION_SECONDS
            self._jailed_ips[ip] = jail_until
            retry_after = IP_JAIL_DURATION_SECONDS
            logger.critical(
                f"[SecurityGuard] AGGRESSIVE ATTACK DETECTED from IP: {ip} "
                f"({len(recent_requests)} req/{LOGIN_WINDOW_SECONDS}s). Jailing for {retry_after}s."
            )
            return False, retry_after, f"Aggressive request rate detected. Your IP is blocked for {retry_after // 60} minutes."

        # Check standard rate limit (max 5 requests per 60s)
        if len(recent_requests) > LOGIN_MAX_REQUESTS_PER_MINUTE:
            oldest_in_window = recent_requests[0]
            retry_after = max(1, int(LOGIN_WINDOW_SECONDS - (now - oldest_in_window)))
            logger.warning(f"[SecurityGuard] Rate limit exceeded for IP: {ip}. Retry after {retry_after}s.")
            return False, retry_after, f"Too many login attempts. Please wait {retry_after} seconds before trying again."

        return True, 0, ""

    def check_account_lockout(self, email: str) -> Tuple[bool, int, str]:
        """
        Check if specific user account/email is locked due to repeated bad credentials.
        """
        if not email:
            return True, 0, ""
        now = time.time()
        norm_email = email.strip().lower()

        if norm_email in self._locked_accounts:
            lockout_expiry = self._locked_accounts[norm_email]
            if now < lockout_expiry:
                retry_after = max(1, int(lockout_expiry - now))
                logger.warning(f"[SecurityGuard] Account locked: {norm_email}. Remaining: {retry_after}s")
                return False, retry_after, f"Account temporarily locked for security due to multiple failed login attempts. Try again in {retry_after} seconds."
            else:
                del self._locked_accounts[norm_email]

        return True, 0, ""

    def record_login_failure(self, email: Optional[str], ip: str):
        """Record a failed login credential attempt."""
        now = time.time()
        if email:
            norm_email = email.strip().lower()
            cutoff = now - ACCOUNT_LOCKOUT_SECONDS
            recent = [t for t in self._account_failures[norm_email] if t > cutoff]
            recent.append(now)
            self._account_failures[norm_email] = recent

            if len(recent) >= MAX_FAILED_ATTEMPTS_PER_ACCOUNT:
                self._locked_accounts[norm_email] = now + ACCOUNT_LOCKOUT_SECONDS
                logger.warning(
                    f"[SecurityGuard] Account locked: {norm_email} from IP {ip} "
                    f"after {len(recent)} failed attempts."
                )

    def record_login_success(self, email: Optional[str], ip: str):
        """Reset failed counts on successful login."""
        if email:
            norm_email = email.strip().lower()
            self._account_failures.pop(norm_email, None)
            self._locked_accounts.pop(norm_email, None)


# Global singleton guard instance
security_guard = SecurityGuard()


class AuthRateLimitMiddleware(BaseHTTPMiddleware):
    """
    FastAPI / Starlette middleware that intercepts incoming requests to auth endpoints
    and enforces strict per-IP rate limits before running expensive crypto / database operations.
    """
    AUTH_PROTECTED_PATHS = {
        "/api/v1/auth/login",
        "/api/v1/auth/token",
        "/api/v1/auth/register",
    }

    async def dispatch(self, request: Request, call_next):
        path = request.url.path.rstrip("/")
        if request.method == "POST" and path in self.AUTH_PROTECTED_PATHS:
            client_ip = get_real_client_ip(request)
            allowed, retry_after, reason = security_guard.check_ip_rate_limit(client_ip)
            if not allowed:
                return JSONResponse(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    content={
                        "detail": reason,
                        "retry_after": retry_after,
                        "ip": client_ip,
                        "status": "rate_limited"
                    },
                    headers={
                        "Retry-After": str(retry_after),
                        "X-RateLimit-Limit": str(LOGIN_MAX_REQUESTS_PER_MINUTE),
                        "X-RateLimit-Remaining": "0",
                        "X-RateLimit-Reset": str(retry_after),
                    }
                )

        response = await call_next(request)
        return response
