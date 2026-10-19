/** Readiness check only: managed production schemas are updated by Publish. */
export async function assertTutorialSchemaReady(database: {
  query: (sql: string) => Promise<unknown>;
}): Promise<void> {
  try {
    await database.query("SELECT tutorials_enabled FROM users LIMIT 0");
  } catch (cause) {
    throw new Error(
      "Tutorial preference schema is not ready. Apply the development migration, then re-publish so the managed production schema is updated before this server starts.",
      { cause },
    );
  }
}
