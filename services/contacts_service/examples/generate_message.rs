// Small utility to generate a sample connections message to send to the SQS service
use conation_user_id::user_id::MacroUserIdStr;
use contacts::domain::models::messages::ContactsNodes;
use std::{collections::HashSet, env};

fn print_contacts_message(users: HashSet<MacroUserIdStr<'static>>) {
    println!(
        "{}",
        serde_json::to_string(&ContactsNodes { users }).unwrap()
    );
}

async fn genmsg_add_user_to_group() {
    let mut users: HashSet<MacroUserIdStr<'static>> = [
        "conation|alice@conation.dev",
        "conation|bob@conation.dev",
        "conation|carol@conation.dev",
        "conation|dave@conation.dev",
        "conation|eve@conation.dev",
        "conation|frank@conation.dev",
        "conation|grace@conation.dev",
    ]
    .iter()
    .map(|s| MacroUserIdStr::try_from(s.to_string()).unwrap())
    .collect();
    users.insert(MacroUserIdStr::try_from("conation|henry@conation.dev".to_string()).unwrap());
    print_contacts_message(users);
}

async fn genmsg_add_paul() {
    let mut users: HashSet<MacroUserIdStr<'static>> = [
        "conation|zeus@olympus.mountain",
        "conation|athena@olympus.mountain",
        "conation|apollo@olympus.mountain",
        "conation|hermes@olympus.mountain",
        "conation|poseidon@olympus.mountain",
    ]
    .iter()
    .map(|s| MacroUserIdStr::try_from(s.to_string()).unwrap())
    .collect();
    users.insert(MacroUserIdStr::try_from("conation|paul@conation.dev".to_string()).unwrap());
    print_contacts_message(users);
}

async fn genmsg_create_group() {
    let users: HashSet<MacroUserIdStr<'static>> = [
        "conation|jupiter@olympus.mountain",
        "conation|athena@olympus.mountain",
        "conation|mercury@olympus.mountain",
        "conation|neptune@olympus.mountain",
        "conation|paul@conation.dev",
    ]
    .iter()
    .map(|s| MacroUserIdStr::try_from(s.to_string()).unwrap())
    .collect();
    print_contacts_message(users);
}

async fn genmsg_add_participants() {
    let users: HashSet<MacroUserIdStr<'static>> = [
        "conation|an@uruk.place",
        "conation|enlil@nippur.place",
        "conation|enki@eridu.place",
        "conation|marduk@babylon.place",
        "conation|paul@conation.dev",
        "conation|poseidon@olympus.mountain",
    ]
    .iter()
    .map(|s| MacroUserIdStr::try_from(s.to_string()).unwrap())
    .collect();
    print_contacts_message(users);
}

#[tokio::main]
async fn main() {
    let mut args = env::args();
    dbg!(args.len());
    if args.len() < 2 {
        panic!("enter a command");
    }
    let cmd = args.nth(1).unwrap();
    match cmd.as_str() {
        "add_user_to_group" => genmsg_add_user_to_group().await,
        "add_paul" => genmsg_add_paul().await,
        "create_group" => genmsg_create_group().await,
        "add_participants" => genmsg_add_participants().await,
        _ => panic!("could not find command '{}'", cmd),
    }
}
