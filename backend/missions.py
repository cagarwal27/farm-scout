"""
Mission generation module.
Takes hotspot FeatureCollection + optional weather context,
returns prioritized scout missions with AI-generated findings.

If OPENAI_API_KEY is set, findings come from GPT-4o-mini.
Otherwise, falls back to template-based findings.
"""

import json
import os

# ---------------------------------------------------------------------------
# Template fallbacks (used when OpenAI is unavailable)
# ---------------------------------------------------------------------------
FINDING_TEMPLATES = {
    "high": [
        "Severe leaf scorch across {acres}-acre block. {drop}% NDVI decline concentrated in west-facing rows — consistent with sustained heat exposure. Canopy thermal damage confirmed.",
        "Significant canopy dieback spanning {acres} acres. {drop}% vegetation loss indicates irrigation system failure compounded by sustained heat stress. Root zone moisture critically low.",
        "Acute stress cluster covering {acres} acres with {drop}% decline. Pattern matches solar exposure damage — south-facing canopy bearing the brunt of the heat event.",
    ],
    "medium": [
        "Moderate wilting detected across {acres}-acre section. {drop}% decline suggests partial irrigation deficit — likely blocked emitters in drip lines rather than systemic failure.",
        "Early pest-stress signature in {acres}-acre block. {drop}% canopy thinning with irregular spatial pattern, inconsistent with heat alone. Mite or borer activity suspected.",
    ],
    "low": [
        "Minor canopy thinning across {acres} acres. {drop}% change is within seasonal variance but warrants monitoring given recent heat event.",
        "Slight leaf curling in {acres}-acre section. {drop}% decline is marginal — likely transient heat response. No intervention needed if temps normalize.",
    ],
}

ACTIONS_TEMPLATES = {
    "high": [
        "Increase irrigation to 125% for 72 hours. Deploy soil moisture sensors. Re-scan in 5 days.",
        "Emergency drip line inspection — rows 20-45. Flush system, replace clogged emitters. Verify pressure.",
        "Apply foliar spray to reduce transpiration. Adjust irrigation schedule to early AM. Flag for crop insurance.",
    ],
    "medium": [
        "Inspect drip lines in affected rows. Check emitter flow rates. Increase irrigation 10% if moisture below threshold.",
        "Deploy sticky traps and conduct manual leaf inspection. If mites confirmed, schedule targeted miticide application.",
    ],
    "low": [
        "No immediate action. Schedule follow-up scan in 7 days to confirm recovery trend.",
        "Continue standard irrigation. Monitor canopy color via next satellite pass.",
    ],
}

CHECKLISTS = {
    "high": [
        "Inspect canopy for scorch or browning",
        "Check soil moisture at root zone",
        "Inspect irrigation emitters for blockage",
        "Capture 4 canopy photos (N/S/E/W)",
    ],
    "medium_heat": [
        "Check for leaf curling or wilting",
        "Inspect drip lines for leaks",
        "Note any discoloration patterns",
        "Capture 4 canopy photos (N/S/E/W)",
    ],
    "medium_pest": [
        "Check for leaf curling or wilting",
        "Look for pest presence (mites, borers)",
        "Capture 4 canopy photos (N/S/E/W)",
    ],
    "low": [
        "General canopy health assessment",
        "Check soil moisture at root zone",
        "Capture 4 canopy photos (N/S/E/W)",
    ],
}

REVENUE_PER_ACRE = 1400  # $/acre/year for almonds/orchards


# ---------------------------------------------------------------------------
# OpenAI integration
# ---------------------------------------------------------------------------
def _generate_ai_findings(missions: list[dict], weather_context: dict | None) -> dict | None:
    """
    Call GPT-4o-mini to generate contextual findings and actions for each zone.
    Returns dict mapping zone_id → {"finding": ..., "action": ...} or None on failure.
    """
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return None

    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
    except Exception:
        return None

    # Build weather summary for the prompt
    weather_summary = "No weather data available."
    if weather_context:
        alerts = weather_context.get("alerts", [])
        correlation = weather_context.get("correlation", {})
        daily = weather_context.get("daily", [])

        alert_lines = [f"- {a['label']}" for a in alerts]
        max_temp = max((d.get("temp_max_f", 0) for d in daily), default=0)
        min_precip = sum(d.get("precipitation_in", 0) for d in daily)

        weather_summary = f"""Weather alerts: {chr(10).join(alert_lines) if alert_lines else 'None'}
Primary correlation: {correlation.get('primary', 'Unknown')}
Secondary correlation: {correlation.get('secondary', 'Unknown')}
Confidence: {correlation.get('confidence', 'unknown')}
Peak temperature: {max_temp:.0f}°F
Total precipitation: {min_precip:.2f} inches over {len(daily)} days"""

    # Build zone descriptions
    zone_lines = []
    for m in missions:
        drop_pct = abs(round(m["ndvi_drop"] * 100, 1))
        zone_lines.append(
            f"- Zone {m['zone_id']}: {m['severity']} severity, "
            f"{m['area_acres']} acres, {drop_pct}% NDVI decline, "
            f"${m['yield_at_risk']:,} yield at risk"
        )

    prompt = f"""You are an agricultural AI analyst for FarmSense, a satellite crop intelligence platform.

You have detected {len(missions)} stress zones in an orchard using Sentinel-2 satellite NDVI change detection.

{weather_summary}

Zones detected:
{chr(10).join(zone_lines)}

For EACH zone, provide:
1. "finding": A specific agronomic diagnosis (2-3 sentences). Reference the actual NDVI drop percentage, acreage, and weather data. Explain the likely ROOT CAUSE — what's actually happening to the trees and why. Each zone's finding must be unique and specific.
2. "action": A concrete recommended intervention (1-2 sentences). Include specific steps — irrigation percentages, inspection targets, treatment types. Be actionable, not vague.

Respond in JSON format:
{{
  "zones": {{
    "A": {{ "finding": "...", "action": "..." }},
    ...
  }}
}}"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a precision agriculture expert. Provide concise, technical, actionable analysis. Always reference specific data points from the input."},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.7,
            max_tokens=1500,
        )

        result = json.loads(response.choices[0].message.content)
        return result.get("zones", {})
    except Exception as e:
        print(f"[missions] OpenAI call failed: {e}")
        return None


# ---------------------------------------------------------------------------
# Main mission generation
# ---------------------------------------------------------------------------
def generate_missions(hotspots_fc: dict, weather_context: dict | None = None) -> dict:
    """
    Generate prioritized scout missions from hotspot FeatureCollection.
    Priority is determined by: severity weight * area (descending).
    """
    features = hotspots_fc.get("features", [])
    if not features:
        return {
            "missions": [],
            "summary": {
                "total_zones": 0,
                "estimated_hours": 0.0,
                "crew_required": 1,
                "total_yield_at_risk": 0,
            },
        }

    severity_weight = {"high": 3, "medium": 2, "low": 1}

    # Score and sort features by priority
    scored = []
    for f in features:
        props = f.get("properties", {})
        sev = props.get("severity", "low")
        area = props.get("area_acres", 1.0)
        score = severity_weight.get(sev, 1) * area
        scored.append((score, f))

    scored.sort(key=lambda x: x[0], reverse=True)

    # Build missions (without findings yet)
    missions = []
    total_acres = 0.0
    for priority, (score, feature) in enumerate(scored, start=1):
        props = feature.get("properties", {})
        severity = props.get("severity", "low")
        area = props.get("area_acres", 1.0)
        total_acres += area

        # Pick checklist based on severity
        if severity == "high":
            checklist = CHECKLISTS["high"]
        elif severity == "medium":
            if priority % 2 == 1:
                checklist = CHECKLISTS["medium_heat"]
            else:
                checklist = CHECKLISTS["medium_pest"]
        else:
            checklist = CHECKLISTS["low"]

        ndvi_drop = props.get("ndvi_drop", -0.10)

        # Yield-at-risk estimate
        yield_loss_pct = min(abs(ndvi_drop) * 3, 1.0)
        yield_at_risk = round(area * REVENUE_PER_ACRE * yield_loss_pct)

        missions.append({
            "zone_id": props.get("cluster_id", chr(64 + priority)),
            "priority": priority,
            "area_acres": area,
            "ndvi_drop": ndvi_drop,
            "severity": severity,
            "centroid": props.get("centroid", [0, 0]),
            "checklist": checklist,
            "finding": "",  # filled below
            "action": "",   # filled below
            "yield_at_risk": yield_at_risk,
        })

    # Cap at 5 zones
    if len(missions) > 5:
        missions = missions[:5]

    # Try AI-generated findings first
    ai_findings = _generate_ai_findings(missions, weather_context)

    for i, m in enumerate(missions):
        zone_id = m["zone_id"]
        severity = m["severity"]
        ndvi_drop = m["ndvi_drop"]
        area = m["area_acres"]
        drop_pct = abs(round(ndvi_drop * 100, 1))

        if ai_findings and zone_id in ai_findings:
            # Use AI-generated findings
            m["finding"] = ai_findings[zone_id].get("finding", "")
            m["action"] = ai_findings[zone_id].get("action", "")
            m["ai_generated"] = True
        else:
            # Fall back to templates
            templates = FINDING_TEMPLATES.get(severity, FINDING_TEMPLATES["low"])
            m["finding"] = templates[i % len(templates)].format(drop=drop_pct, acres=area)
            action_options = ACTIONS_TEMPLATES.get(severity, ACTIONS_TEMPLATES["low"])
            m["action"] = action_options[i % len(action_options)]
            m["ai_generated"] = False

    # Compute summary
    included_acres = sum(m["area_acres"] for m in missions)
    estimated_hours = round(len(missions) * 0.4 + included_acres * 0.1, 1)
    crew_required = 1 if included_acres < 10 else 2
    total_yield_at_risk = sum(m["yield_at_risk"] for m in missions)

    ai_powered = any(m.get("ai_generated") for m in missions)
    print(f"[missions] Generated {len(missions)} missions (AI: {ai_powered})")

    return {
        "missions": missions,
        "summary": {
            "total_zones": len(missions),
            "estimated_hours": estimated_hours,
            "crew_required": crew_required,
            "total_yield_at_risk": total_yield_at_risk,
        },
    }
