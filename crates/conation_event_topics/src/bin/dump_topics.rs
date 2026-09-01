//! Prints all Kafka topic names defined in `conation_event_topics` as a JSON array.

fn main() {
    println!(
        "{}",
        serde_json::to_string(&conation_event_topics::all_topic_names())
            .expect("serializing topic names cannot fail")
    );
}
