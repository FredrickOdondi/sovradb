// Parser module for PostgreSQL Wire Protocol and SQL AST inspection
use sqlparser::parser::Parser;
use sqlparser::dialect::PostgreSqlDialect;
use sqlparser::ast::Statement;

/// Parses a SQL query string to determine if it is a SELECT, INSERT, or UPDATE.
/// If it is a DDL statement, we return false indicating deep inspection is not needed.
pub fn requires_deep_inspection(sql: &str) -> bool {
    let dialect = PostgreSqlDialect {};
    let ast = match Parser::parse_sql(&dialect, sql) {
        Ok(statements) => statements,
        Err(_) => return false, // If parsing fails, maybe bypass or reject (depending on strictness)
    };

    for stmt in ast {
        match stmt {
            Statement::Query(_) | Statement::Insert { .. } | Statement::Update { .. } => return true,
            _ => continue,
        }
    }
    
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_smart_sql_parsing() {
        // DML Statements that MUST trigger deep inspection
        let select_sql = "SELECT id, email, ssn FROM users WHERE id = 1";
        let insert_sql = "INSERT INTO users (email) VALUES ('test@test.com')";
        let update_sql = "UPDATE users SET email = 'new@test.com' WHERE id = 1";

        assert_eq!(requires_deep_inspection(select_sql), true, "SELECT should require inspection");
        assert_eq!(requires_deep_inspection(insert_sql), true, "INSERT should require inspection");
        assert_eq!(requires_deep_inspection(update_sql), true, "UPDATE should require inspection");

        // DDL and Admin Statements that MUST bypass deep inspection
        let create_table_sql = "CREATE TABLE users (id INT, email VARCHAR)";
        let drop_table_sql = "DROP TABLE users";
        let vacuum_sql = "VACUUM ANALYZE users";

        assert_eq!(requires_deep_inspection(create_table_sql), false, "CREATE TABLE should bypass inspection");
        assert_eq!(requires_deep_inspection(drop_table_sql), false, "DROP TABLE should bypass inspection");
        
        // sqlparser might not natively parse Postgres-specific VACUUM fully without strict dialect handling, 
        // but any fallback or parsing failure should also default to false (bypass)
        assert_eq!(requires_deep_inspection(vacuum_sql), false, "VACUUM should bypass inspection");
    }
}
