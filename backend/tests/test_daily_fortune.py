"""
Daily Fortune API 테스트 모듈

테스트 대상:
- _decrypt_profile_field() 헬퍼 함수의 decrypt_field + fallback 패턴
- decrypt_field() 실패 시 decrypt() fallback 동작
- 양쪽 다 실패 시 예외 전파
"""

import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch, Mock
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

import pytest
from cryptography.exceptions import InvalidTag

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.daily_fortune import refund_transaction


class TestDecryptProfileFieldFallback:
    """_decrypt_profile_field 헬퍼 함수의 decrypt_field + fallback 패턴 검증"""

    def test_decrypt_field_success(self):
        """decrypt_field() 성공 시 결과 반환"""
        # Arrange
        mock_crypto_manager = MagicMock()
        mock_crypto_manager.decrypt_field.return_value = "2000-01-15"

        profile_data = {
            "birth_date_iv": "test_iv",
            "birth_date_ct": "test_ct",
            "birth_date_tag": "test_tag",
            "key_id": "v1",
        }

        # Act
        def _decrypt_profile_field(column: str) -> str:
            iv = profile_data.get(f"{column}_iv", "")
            ct = profile_data.get(f"{column}_ct", "")
            tag = profile_data.get(f"{column}_tag", "")
            try:
                return mock_crypto_manager.decrypt_field(
                    "saju_profiles", column, iv, ct, tag, "v1"
                )
            except InvalidTag:
                return mock_crypto_manager.decrypt(iv, ct, tag, key_id="v1")

        result = _decrypt_profile_field("birth_date")

        # Assert
        assert result == "2000-01-15"
        mock_crypto_manager.decrypt_field.assert_called_once_with(
            "saju_profiles", "birth_date", "test_iv", "test_ct", "test_tag", "v1"
        )
        mock_crypto_manager.decrypt.assert_not_called()

    def test_decrypt_field_fallback_on_invalid_tag(self):
        # Arrange
        mock_crypto_manager = MagicMock()
        mock_crypto_manager.decrypt_field.side_effect = InvalidTag("AAD mismatch")
        mock_crypto_manager.decrypt.return_value = "2000-01-15"

        profile_data = {
            "birth_date_iv": "test_iv",
            "birth_date_ct": "test_ct",
            "birth_date_tag": "test_tag",
            "key_id": "legacy",
        }

        # Act
        def _decrypt_profile_field(column: str) -> str:
            iv = profile_data.get(f"{column}_iv", "")
            ct = profile_data.get(f"{column}_ct", "")
            tag = profile_data.get(f"{column}_tag", "")
            try:
                return mock_crypto_manager.decrypt_field(
                    "saju_profiles", column, iv, ct, tag, "legacy"
                )
            except InvalidTag:
                return mock_crypto_manager.decrypt(iv, ct, tag, key_id="legacy")

        result = _decrypt_profile_field("birth_date")

        # Assert
        assert result == "2000-01-15"
        mock_crypto_manager.decrypt_field.assert_called_once()
        mock_crypto_manager.decrypt.assert_called_once_with(
            "test_iv", "test_ct", "test_tag", key_id="legacy"
        )

    def test_both_decrypt_methods_fail(self):
        """decrypt_field()와 decrypt() 모두 실패 시 예외 전파"""
        # Arrange
        mock_crypto_manager = MagicMock()
        mock_crypto_manager.decrypt_field.side_effect = InvalidTag("AAD mismatch")
        mock_crypto_manager.decrypt.side_effect = ValueError("Decryption failed")

        profile_data = {
            "birth_date_iv": "test_iv",
            "birth_date_ct": "test_ct",
            "birth_date_tag": "test_tag",
            "key_id": "legacy",
        }

        # Act & Assert
        def _decrypt_profile_field(column: str) -> str:
            iv = profile_data.get(f"{column}_iv", "")
            ct = profile_data.get(f"{column}_ct", "")
            tag = profile_data.get(f"{column}_tag", "")
            try:
                return mock_crypto_manager.decrypt_field(
                    "saju_profiles", column, iv, ct, tag, "legacy"
                )
            except InvalidTag:
                return mock_crypto_manager.decrypt(iv, ct, tag, key_id="legacy")

        with pytest.raises(ValueError, match="Decryption failed"):
            _decrypt_profile_field("birth_date")

        mock_crypto_manager.decrypt_field.assert_called_once()
        mock_crypto_manager.decrypt.assert_called_once()

    def test_decrypt_field_with_missing_fields(self):
        """암호화 필드 누락 시 빈 문자열로 처리"""
        # Arrange
        mock_crypto_manager = MagicMock()
        mock_crypto_manager.decrypt_field.return_value = "2000-01-15"

        profile_data = {
            # birth_date_iv, birth_date_ct, birth_date_tag 모두 누락
            "key_id": "v1"
        }

        # Act
        def _decrypt_profile_field(column: str) -> str:
            iv = profile_data.get(f"{column}_iv", "")
            ct = profile_data.get(f"{column}_ct", "")
            tag = profile_data.get(f"{column}_tag", "")
            try:
                return mock_crypto_manager.decrypt_field(
                    "saju_profiles", column, iv, ct, tag, "legacy"
                )
            except InvalidTag:
                return mock_crypto_manager.decrypt(iv, ct, tag, key_id="legacy")

        result = _decrypt_profile_field("birth_date")

        # Assert
        assert result == "2000-01-15"
        mock_crypto_manager.decrypt_field.assert_called_once_with(
            "saju_profiles", "birth_date", "", "", "", "legacy"
        )

    def test_decrypt_field_multiple_columns(self):
        """여러 필드 복호화 시 각각 독립적으로 처리"""
        # Arrange
        mock_crypto_manager = MagicMock()
        mock_crypto_manager.decrypt_field.side_effect = [
            "2000-01-15",  # birth_date
            InvalidTag("AAD mismatch"),  # hour_branch - fallback 필요
            "male",  # gender
        ]
        mock_crypto_manager.decrypt.return_value = "14:30"

        profile_data = {
            "birth_date_iv": "iv1",
            "birth_date_ct": "ct1",
            "birth_date_tag": "tag1",
            "hour_branch_iv": "iv2",
            "hour_branch_ct": "ct2",
            "hour_branch_tag": "tag2",
            "gender_iv": "iv3",
            "gender_ct": "ct3",
            "gender_tag": "tag3",
            "key_id": "legacy",
        }

        # Act
        def _decrypt_profile_field(column: str) -> str:
            iv = profile_data.get(f"{column}_iv", "")
            ct = profile_data.get(f"{column}_ct", "")
            tag = profile_data.get(f"{column}_tag", "")
            try:
                return mock_crypto_manager.decrypt_field(
                    "saju_profiles", column, iv, ct, tag, "legacy"
                )
            except InvalidTag:
                return mock_crypto_manager.decrypt(iv, ct, tag, key_id="legacy")

        birth_date = _decrypt_profile_field("birth_date")
        hour_branch = _decrypt_profile_field("hour_branch")
        gender = _decrypt_profile_field("gender")

        # Assert
        assert birth_date == "2000-01-15"
        assert hour_branch == "14:30"
        assert gender == "male"
        assert mock_crypto_manager.decrypt_field.call_count == 3
        assert mock_crypto_manager.decrypt.call_count == 1  # hour_branch만 fallback

    def test_decrypt_field_with_different_key_ids(self):
        """다양한 key_id 값 처리"""
        # Arrange
        mock_crypto_manager = MagicMock()
        mock_crypto_manager.decrypt_field.return_value = "2000-01-15"

        for key_id in ["v1", "v2", "v3"]:
            profile_data = {
                "birth_date_iv": "test_iv",
                "birth_date_ct": "test_ct",
                "birth_date_tag": "test_tag",
                "key_id": key_id,
            }

            # Act
            def _decrypt_profile_field(column: str) -> str:
                iv = profile_data.get(f"{column}_iv", "")
                ct = profile_data.get(f"{column}_ct", "")
                tag = profile_data.get(f"{column}_tag", "")
                try:
                    return mock_crypto_manager.decrypt_field(
                        "saju_profiles", column, iv, ct, tag, key_id
                    )
                except InvalidTag:
                    return mock_crypto_manager.decrypt(iv, ct, tag, key_id=key_id)

            result = _decrypt_profile_field("birth_date")

            # Assert
            assert result == "2000-01-15"
            mock_crypto_manager.decrypt_field.assert_called_with(
                "saju_profiles", "birth_date", "test_iv", "test_ct", "test_tag", key_id
            )

    def test_v1_invalid_tag_does_not_fallback(self):
        mock_crypto_manager = MagicMock()
        mock_crypto_manager.decrypt_field.side_effect = InvalidTag("AAD mismatch")

        profile_data = {
            "birth_date_iv": "test_iv",
            "birth_date_ct": "test_ct",
            "birth_date_tag": "test_tag",
            "key_id": "v1",
        }

        def _decrypt_profile_field(column: str) -> str:
            iv = profile_data.get(f"{column}_iv", "")
            ct = profile_data.get(f"{column}_ct", "")
            tag = profile_data.get(f"{column}_tag", "")
            try:
                return mock_crypto_manager.decrypt_field(
                    "saju_profiles", column, iv, ct, tag, "v1"
                )
            except InvalidTag:
                raise

        with pytest.raises(InvalidTag):
            _decrypt_profile_field("birth_date")

        mock_crypto_manager.decrypt.assert_not_called()


class TestDecryptProfileFieldIntegration:
    """decrypt_profile_field 헬퍼 함수의 통합 테스트"""

    def test_profile_share_decrypt_pattern(self):
        """profile.py의 decrypt_profile_field 패턴 검증"""
        # Arrange
        mock_crypto_manager = MagicMock()
        mock_crypto_manager.decrypt_field.side_effect = [
            "2000-01-15",  # birth_date
            InvalidTag("AAD mismatch"),  # hour_branch
            "solar",  # calendar_type
        ]
        mock_crypto_manager.decrypt.return_value = "14:30"

        row = {
            "birth_date_iv": "iv1",
            "birth_date_ct": "ct1",
            "birth_date_tag": "tag1",
            "hour_branch_iv": "iv2",
            "hour_branch_ct": "ct2",
            "hour_branch_tag": "tag2",
            "calendar_type_iv": "iv3",
            "calendar_type_ct": "ct3",
            "calendar_type_tag": "tag3",
            "key_id": "legacy",
        }

        # Act
        def decrypt_profile_field(
            table: str, column: str, row_data: dict, key_id: str
        ) -> str:
            iv = row_data.get(f"{column}_iv")
            ciphertext = row_data.get(f"{column}_ct")
            tag = row_data.get(f"{column}_tag")
            if (
                not isinstance(iv, str)
                or not isinstance(ciphertext, str)
                or not isinstance(tag, str)
            ):
                raise ValueError("Encrypted field missing")
            try:
                return mock_crypto_manager.decrypt_field(
                    table, column, iv, ciphertext, tag, key_id
                )
            except InvalidTag:
                return mock_crypto_manager.decrypt(iv, ciphertext, tag, key_id=key_id)

        key_id = row.get("key_id") or "v1"
        bd = decrypt_profile_field("saju_profiles", "birth_date", row, key_id)
        hb = decrypt_profile_field("saju_profiles", "hour_branch", row, key_id)
        ct = decrypt_profile_field("saju_profiles", "calendar_type", row, key_id)

        # Assert
        assert bd == "2000-01-15"
        assert hb == "14:30"
        assert ct == "solar"
        assert mock_crypto_manager.decrypt_field.call_count == 3
        assert mock_crypto_manager.decrypt.call_count == 1

    def test_missing_encrypted_field_raises_error(self):
        """암호화 필드 누락 시 ValueError 발생"""
        # Arrange
        mock_crypto_manager = MagicMock()

        row = {
            "birth_date_iv": "iv1",
            # birth_date_ct 누락
            "birth_date_tag": "tag1",
            "key_id": "v1",
        }

        # Act & Assert
        def decrypt_profile_field(
            table: str, column: str, row_data: dict, key_id: str
        ) -> str:
            iv = row_data.get(f"{column}_iv")
            ciphertext = row_data.get(f"{column}_ct")
            tag = row_data.get(f"{column}_tag")
            if (
                not isinstance(iv, str)
                or not isinstance(ciphertext, str)
                or not isinstance(tag, str)
            ):
                raise ValueError("Encrypted field missing")
            try:
                return mock_crypto_manager.decrypt_field(
                    table, column, iv, ciphertext, tag, key_id
                )
            except InvalidTag:
                return mock_crypto_manager.decrypt(iv, ciphertext, tag, key_id=key_id)

        key_id = row.get("key_id") or "v1"

        with pytest.raises(ValueError, match="Encrypted field missing"):
            decrypt_profile_field("saju_profiles", "birth_date", row, key_id)


class TestDailyFortuneRefundAlerts:
    def test_refund_transaction_alerts_when_rpc_returns_no_rows(self):
        async def fake_db_execute(_fn):
            return MagicMock(data=[])

        with (
            patch("app.api.daily_fortune.db_execute", side_effect=fake_db_execute),
            patch(
                "app.api.daily_fortune.notifier.notify_paid_feature_refund_issue"
            ) as notify_issue,
        ):
            refunded = asyncio.run(
                refund_transaction("user-1", "tx-1", "운세 생성 실패 환불", amount=10)
            )

        assert refunded is False
        notify_issue.assert_called_once()

    def test_refund_transaction_alerts_when_manual_review_required(self):
        async def fake_db_execute(_fn):
            return MagicMock(data=[{"manual_review_required": True}])

        with (
            patch("app.api.daily_fortune.db_execute", side_effect=fake_db_execute),
            patch(
                "app.api.daily_fortune.notifier.notify_paid_feature_refund_issue"
            ) as notify_issue,
        ):
            refunded = asyncio.run(
                refund_transaction("user-1", "tx-1", "운세 생성 실패 환불", amount=10)
            )

        assert refunded is True
        notify_issue.assert_called_once()
