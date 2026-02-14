"""
Mission generation module.
Takes hotspot FeatureCollection, returns prioritized scout missions
matching the frontend MissionsResponse contract.
"""


# Checklist templates based on severity and stress type
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


def generate_missions(hotspots_fc: dict) -> dict:
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

    # Build missions
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
            # Alternate between heat and pest checklists for variety
            if priority % 2 == 1:
                checklist = CHECKLISTS["medium_heat"]
            else:
                checklist = CHECKLISTS["medium_pest"]
        else:
            checklist = CHECKLISTS["low"]

        missions.append({
            "zone_id": props.get("cluster_id", chr(64 + priority)),
            "priority": priority,
            "area_acres": area,
            "ndvi_drop": props.get("ndvi_drop", -0.10),
            "centroid": props.get("centroid", [0, 0]),
            "checklist": checklist,
        })

    # Only include top zones (skip low-severity if too many)
    if len(missions) > 5:
        missions = missions[:5]

    # Compute summary
    included_acres = sum(m["area_acres"] for m in missions)
    estimated_hours = round(len(missions) * 0.4 + included_acres * 0.1, 1)
    crew_required = 1 if included_acres < 10 else 2

    return {
        "missions": missions,
        "summary": {
            "total_zones": len(missions),
            "estimated_hours": estimated_hours,
            "crew_required": crew_required,
        },
    }
