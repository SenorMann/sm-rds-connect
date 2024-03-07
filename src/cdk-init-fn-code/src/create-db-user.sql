DO
$$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'readonly_user') THEN
        CREATE USER readonly_user;
        GRANT rds_iam TO readonly_user;
    END IF;
END
$$;