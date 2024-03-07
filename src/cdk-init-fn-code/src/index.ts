import { SecretsManager } from "@aws-sdk/client-secrets-manager";
import { CloudFormationCustomResourceResponse, CloudFormationCustomResourceUpdateEvent } from "aws-lambda";
import { Client } from "pg"
import { readFileSync } from "fs";
import path from "path"

interface DatabaseConfig {
  dbname: string;
  host: string;
  password: string;
  port: number;
  username: string;
}

let client: Client
const createDbUserQuery = readFileSync(path.join(__dirname, "create-db-user.sql"), "utf-8").toString()
const secretsManager = new SecretsManager();
const secretId = process.env.SECRET_NAME || "";

async function getSecretValue<T>(secretId: string) {
  const secret = await secretsManager.getSecretValue({ SecretId: secretId });
  if (!secret.SecretString) {
    throw new Error(`Failed to find secret with the specified id: ${secretId}`);
  }
  return JSON.parse(secret.SecretString) as T;
}

export async function handler(event: CloudFormationCustomResourceUpdateEvent): Promise<CloudFormationCustomResourceResponse> {
  try {
    if (!client) {
      const { dbname, host, password, port, username } = await getSecretValue<DatabaseConfig>(secretId);
      client = new Client({ database: dbname, host, password, port, user: username });
    }
    await client.connect();
    const results = await client.query(createDbUserQuery);
    return {
      Status: "SUCCESS",
      LogicalResourceId: event.LogicalResourceId,
      PhysicalResourceId: event.PhysicalResourceId,
      RequestId: event.RequestId,
      StackId: event.StackId,
      Data: results
    }
  } catch (err) {
    return {
      Status: "FAILED",
      LogicalResourceId: event.LogicalResourceId,
      PhysicalResourceId: event.PhysicalResourceId,
      Reason: (err as Error).message,
      RequestId: event.RequestId,
      StackId: event.StackId,
    }
  } finally {
    await client.end()
  }

}
