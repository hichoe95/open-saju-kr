import copy
import json
import urllib.parse


CANONICAL_RESUME_VERSION = "summary_hub_resume.v1"
CANONICAL_RESUME_PREFIX = "shr.v1"


def _build_resume_token(
    *,
    reading_id: str,
    target_tab: str,
    feature_key: str,
    cta_surface: str,
) -> dict:
    issued_at = 1_743_206_400_000

    def destination(*, focus: str, detail_unlocked: bool) -> dict:
        return {
            "pathname": "/",
            "screen": "summary_hub",
            "reading_id": reading_id,
            "active_tab": target_tab,
            "focus": focus,
            "detail_unlocked": detail_unlocked,
        }

    return {
        "version": CANONICAL_RESUME_VERSION,
        "issued_at": issued_at,
        "reading_id": reading_id,
        "entitlement_target": {
            "type": "tab_detail",
            "domain_tab": target_tab,
            "feature_key": feature_key,
        },
        "cta_origin": {
            "surface": cta_surface,
            "tab": target_tab,
            "action": "open_paid_detail",
        },
        "return_state": {
            "auth_return": destination(focus="payment_gate", detail_unlocked=False),
            "signup_complete": destination(focus="payment_gate", detail_unlocked=False),
            "payment_success": destination(focus="paid_detail", detail_unlocked=True),
            "payment_failure": destination(
                focus="payment_retry", detail_unlocked=False
            ),
            "payment_cancel": destination(focus="payment_retry", detail_unlocked=False),
        },
        "checkpoint": {
            "last_event": "created",
            "updated_at": issued_at,
        },
    }


def _serialize_resume_token(payload: dict) -> str:
    compact = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    encoded = urllib.parse.quote(compact, safe="")
    return f"{CANONICAL_RESUME_PREFIX}.{encoded}"


def _deserialize_resume_token(raw_token: str) -> dict:
    assert raw_token.startswith(f"{CANONICAL_RESUME_PREFIX}.")
    encoded_payload = raw_token[len(f"{CANONICAL_RESUME_PREFIX}.") :]
    decoded_payload = urllib.parse.unquote(encoded_payload)
    return json.loads(decoded_payload)


def _resolve_destination(payload: dict, event: str) -> dict:
    if event == "refresh":
        checkpoint_to_event = {
            "created": "auth_return",
            "auth_return": "auth_return",
            "signup_complete": "signup_complete",
            "payment_success": "payment_success",
            "payment_failure": "payment_failure",
            "payment_cancel": "payment_cancel",
        }
        target_event = checkpoint_to_event[payload["checkpoint"]["last_event"]]
        return copy.deepcopy(payload["return_state"][target_event])

    return copy.deepcopy(payload["return_state"][event])


def _advance_resume(payload: dict, event: str) -> tuple[dict, dict]:
    destination = _resolve_destination(payload, event)
    next_payload = copy.deepcopy(payload)
    if event != "refresh":
        next_payload["checkpoint"] = {
            "last_event": event,
            "updated_at": payload["checkpoint"]["updated_at"] + 1,
        }

    return next_payload, destination


def test_resume_token_contract_includes_required_fields():
    payload = _build_resume_token(
        reading_id="reading_01HZZABCDE",
        target_tab="love",
        feature_key="tab_love",
        cta_surface="summary_hub_card",
    )

    assert payload["version"] == CANONICAL_RESUME_VERSION
    assert payload["reading_id"] == "reading_01HZZABCDE"

    assert payload["entitlement_target"] == {
        "type": "tab_detail",
        "domain_tab": "love",
        "feature_key": "tab_love",
    }
    assert payload["cta_origin"] == {
        "surface": "summary_hub_card",
        "tab": "love",
        "action": "open_paid_detail",
    }

    assert set(payload["return_state"].keys()) == {
        "auth_return",
        "signup_complete",
        "payment_success",
        "payment_failure",
        "payment_cancel",
    }


def test_resume_token_survives_auth_return():
    payload = _build_resume_token(
        reading_id="reading_01HZZABCDE",
        target_tab="money",
        feature_key="tab_money",
        cta_surface="summary_tab_cta",
    )

    raw = _serialize_resume_token(payload)
    restored = _deserialize_resume_token(raw)
    assert restored["reading_id"] == payload["reading_id"]
    assert restored["entitlement_target"] == payload["entitlement_target"]
    assert restored["cta_origin"] == payload["cta_origin"]

    after_auth, auth_destination = _advance_resume(restored, "auth_return")
    assert auth_destination == {
        "pathname": "/",
        "screen": "summary_hub",
        "reading_id": "reading_01HZZABCDE",
        "active_tab": "money",
        "focus": "payment_gate",
        "detail_unlocked": False,
    }

    raw_after_auth = _serialize_resume_token(after_auth)
    restored_after_auth = _deserialize_resume_token(raw_after_auth)
    _, refresh_destination = _advance_resume(restored_after_auth, "refresh")
    assert refresh_destination == auth_destination


def test_resume_token_survives_payment_fail_or_cancel():
    for terminal_event in ("payment_failure", "payment_cancel"):
        payload = _build_resume_token(
            reading_id="reading_01HZZXYZ99",
            target_tab="career",
            feature_key="tab_career_detail",
            cta_surface="locked_tab_banner",
        )
        after_auth, _ = _advance_resume(payload, "auth_return")
        after_terminal, terminal_destination = _advance_resume(
            after_auth, terminal_event
        )

        assert terminal_destination == {
            "pathname": "/",
            "screen": "summary_hub",
            "reading_id": "reading_01HZZXYZ99",
            "active_tab": "career",
            "focus": "payment_retry",
            "detail_unlocked": False,
        }

        raw_after_terminal = _serialize_resume_token(after_terminal)
        restored_after_terminal = _deserialize_resume_token(raw_after_terminal)
        _, refresh_destination = _advance_resume(restored_after_terminal, "refresh")
        assert refresh_destination == terminal_destination


def test_resume_token_payment_success_restores_context_not_generic_home():
    payload = _build_resume_token(
        reading_id="reading_01HZZSUCC77",
        target_tab="love",
        feature_key="tab_love",
        cta_surface="summary_hub_card",
    )

    after_auth, _ = _advance_resume(payload, "auth_return")
    _, success_destination = _advance_resume(after_auth, "payment_success")

    assert success_destination["pathname"] == "/"
    assert success_destination["screen"] == "summary_hub"
    assert success_destination["reading_id"] == "reading_01HZZSUCC77"
    assert success_destination["active_tab"] == "love"
    assert success_destination["focus"] == "paid_detail"
    assert success_destination["detail_unlocked"] is True

    assert success_destination != {"pathname": "/"}
