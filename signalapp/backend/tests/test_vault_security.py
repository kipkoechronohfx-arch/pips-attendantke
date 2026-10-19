import pytest
from app.api.endpoints.vault import encrypt_password, decrypt_password

def test_fernet_encryption_and_decryption():
    raw_passwords = [
        "SuperSecretTraderPass123!",
        "P@$$w0rd_with_special_chars_#$%",
        "12345678",
        "VeryLongPasswordThatExceedsThirtyTwoCharactersAndIsCompletelySecure123"
    ]
    for pw in raw_passwords:
        encrypted = encrypt_password(pw)
        assert encrypted != pw
        decrypted = decrypt_password(encrypted)
        assert decrypted == pw

def test_fernet_generates_distinct_ciphertexts():
    # Fernet includes random IV / timestamp so same plain text generates different ciphertexts
    pw = "TradingPass99!"
    c1 = encrypt_password(pw)
    c2 = encrypt_password(pw)
    assert c1 != c2
    assert decrypt_password(c1) == pw
    assert decrypt_password(c2) == pw
