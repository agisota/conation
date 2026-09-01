mod config;
mod process;

use anyhow::Context;
use conation_entrypoint::MacroEntrypoint;
use sqlx::postgres::PgPoolOptions;
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    println!("Loading configuration...");
    MacroEntrypoint::default().init();
    let config = config::Config::from_env().context("Failed to load configuration")?;

    println!("Connecting to the database...");
    let db_pool = PgPoolOptions::new()
        .min_connections(5)
        .max_connections(60)
        .connect(&config.database_url)
        .await
        .context("Could not connect to db")?;

    let conation_ids: Vec<String> = config
        .conation_ids
        .split(',')
        .map(|id| id.trim().to_string())
        .collect();

    let aws_config = conation_aws_config::get_conation_aws_config().await;

    let contacts_ingress = contacts::domain::service::SqsContactsIngress {
        queue: contacts::outbound::ingress::SqsContactsQueue::new(
            aws_sdk_sqs::Client::new(&aws_config),
            conation_queues::ContactsQueue::new().to_string(),
        ),
    };

    println!("Processing {} macro IDs: {:?}", conation_ids.len(), conation_ids);

    for (index, conation_id) in conation_ids.iter().enumerate() {
        println!(
            "\n=== Processing macro ID {} ({}/{}) ===",
            conation_id,
            index + 1,
            conation_ids.len()
        );

        match process::process_conation_id(&db_pool, &contacts_ingress, conation_id).await {
            Ok(()) => {
                println!("Completed processing for {}.", conation_id);
            }
            Err(e) => {
                panic!("Failed to process macro ID {}: {:?}", conation_id, e);
            }
        }
    }

    println!("\n=== All macro IDs processed ===");
    Ok(())
}
