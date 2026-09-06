# Legacy setup retired

Do not apply anonymous full-access policies. The legacy test client is network-disabled. Production has NOT been changed.

Use `platform/` and the reviewed migration in `platform/migrations/`; see `docs/01-migration-rollback.md`. Configure only a separate approved test project through environment variables. Use synthetic data, never production contact/medical/signature records.

The new schema defaults to denied access and allows constrained authenticated operations. Applying this schema does not fix existing remote public-table policies. A coordinated, explicitly authorized legacy lockdown and verified external backup are required before any launch.
