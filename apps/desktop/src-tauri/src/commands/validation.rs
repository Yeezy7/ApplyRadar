pub fn is_valid_application_status(status: &str) -> bool {
    matches!(
        status,
        "to_apply"
            | "applied"
            | "received"
            | "under_review"
            | "assessment"
            | "interview"
            | "final_interview"
            | "offer"
            | "rejected"
            | "withdrawn"
            | "unknown"
    )
}
