from enum import Enum

from ...schemas import (
    CardData,
    CharacterData,
    CompatibilityTab,
    DaeunTab,
    HealthTab,
    LifeFlowTab,
    LoveTab,
    LuckyTab,
    MoneyTab,
    ReadingResponse,
    StudyTab,
    TabsData,
    CareerTab,
)


class ReadingProjection(str, Enum):
    SUMMARY = "summary"
    FULL = "full"


def resolve_reading_projection(
    *,
    has_paid_entitlement: bool = False,
) -> ReadingProjection:
    if has_paid_entitlement:
        return ReadingProjection.FULL
    return ReadingProjection.SUMMARY


def project_reading_response(
    full_response: ReadingResponse,
    projection: ReadingProjection,
) -> ReadingResponse:
    if projection == ReadingProjection.FULL:
        return full_response

    summary_character = CharacterData.model_construct(
        summary=full_response.card.character.summary,
        _fields_set={"summary"},
    )
    summary_card = CardData.model_construct(
        stats=full_response.card.stats,
        character=summary_character,
        _fields_set={"stats", "character"},
    )
    summary_tabs = TabsData.model_construct(
        love=_summary_only_tab(LoveTab, full_response.tabs.love),
        money=_summary_only_tab(MoneyTab, full_response.tabs.money),
        career=_summary_only_tab(CareerTab, full_response.tabs.career),
        study=_summary_only_tab(StudyTab, full_response.tabs.study),
        health=_summary_only_tab(HealthTab, full_response.tabs.health),
        compatibility=_summary_only_optional_tab(
            CompatibilityTab, full_response.tabs.compatibility
        ),
        life_flow=_summary_only_tab_fields(
            LifeFlowTab,
            full_response.tabs.life_flow,
            {"mechanism"},
        ),
        daeun=_summary_only_tab(DaeunTab, full_response.tabs.daeun),
        lucky=_summary_only_tab_fields(
            LuckyTab,
            full_response.tabs.lucky,
            {"today_overview"},
        ),
        _fields_set={
            "love",
            "money",
            "career",
            "study",
            "health",
            "compatibility",
            "life_flow",
            "daeun",
            "lucky",
        },
    )

    return ReadingResponse.model_construct(
        one_liner=full_response.one_liner,
        pillars=full_response.pillars,
        card=summary_card,
        tabs=summary_tabs,
        meta=full_response.meta,
        _fields_set={"one_liner", "pillars", "card", "tabs", "meta"},
    )


def dump_projected_reading_response(
    full_response: ReadingResponse,
    projection: ReadingProjection,
) -> dict:
    return project_reading_response(full_response, projection).model_dump(
        exclude_unset=True,
        exclude_none=True,
    )


def _summary_only_tab(tab_cls, tab):
    return tab_cls.model_construct(
        summary=getattr(tab, "summary", ""), _fields_set={"summary"}
    )


def _summary_only_tab_fields(tab_cls, tab, field_names: set[str]):
    return tab_cls.model_construct(
        **{field_name: getattr(tab, field_name) for field_name in field_names},
        _fields_set=field_names,
    )


def _summary_only_optional_tab(tab_cls, tab):
    if tab is None:
        return None
    return _summary_only_tab(tab_cls, tab)
