pub use conation_env::Environment;
use conation_env_var::env_var;

pub struct Config {
    pub environment: Environment,
    pub database_url: String,
    pub user_id: String,
}

env_var!(
    pub struct EnvVars {
        pub DatabaseUrl,
        pub UserId,
    }
);

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let environment = Environment::new_or_prod();
        let env_vars = EnvVars::new()?;

        let EnvVars {
            database_url,
            user_id,
        } = env_vars;

        Ok(Self {
            environment,
            database_url: database_url.to_string(),
            user_id: user_id.to_string(),
        })
    }
}
