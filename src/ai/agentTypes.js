export const AGENT_ACTIONS = [
  "create_flight",
  "edit_flight",
  "cancel_flight",
  "change_aircraft_status",
  "duplicate_flight",
  "query_schedule",
  "query_notam",
];

export const VALID_AIRCRAFT = ["N35EA", "N540JL"];
export const VALID_AIRCRAFT_STATUSES = ["disponible", "mantenimiento", "aog"];
export const VALID_FLIGHT_STATUSES = ["prog", "enc", "comp", "canc"];

export const CREATE_CRITICAL_FIELDS = ["date", "ac", "orig", "dest", "time", "rb"];
export const AGENT_INTENT_TYPES = ["internal_ops_query", "internal_schedule_action", "external_aviation_query", "unknown"];

export const EMPTY_AGENT_RESULT = {
  action: null,
  intent_category: "unknown",
  confidence: 0,
  requires_confirmation: true,
  human_summary: "",
  payload: {
    flight_id: null,
    flight_selector: null,
    date: null,
    ac: null,
    orig: null,
    dest: null,
    time: null,
    rb: null,
    nt: "",
    pm: 0,
    pw: 0,
    pc: 0,
    bg: 0,
    st: "prog",
    status_change: null,
    maintenance_start_date: null,
    maintenance_end_date: null,
    airport_code: null,
    query_scope: null,
  },
  missing_fields: [],
  warnings: [],
  errors: [],
};
