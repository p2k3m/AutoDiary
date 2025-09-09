# Setup Guide

This guide covers prerequisites, configuration and deployment of AutoDiary.

## Prerequisites

- Node.js 20+
- Yarn 4+
- AWS account with permissions to deploy CDK stacks
- AWS CLI configured locally
- (Optional) [GitHub CLI](https://cli.github.com/) for triggering workflows

## Environment variables

### Web client (.env)

Create `packages/web/.env` with:

| Variable | Description |
| --- | --- |
| `VITE_REGION` | AWS region for the web client |
| `VITE_USER_POOL_ID` | Cognito user pool id |
| `VITE_USER_POOL_CLIENT_ID` | Cognito app client id |
| `VITE_IDENTITY_POOL_ID` | Cognito identity pool id |
| `VITE_HOSTED_UI_DOMAIN` | Cognito hosted UI domain |
| `VITE_ENTRY_BUCKET` | S3 bucket for journal entries |
| `VITE_TEST_MODE` | Set to `true` to enable test fixtures |

### Weekly review Lambda

Configure the Lambda with environment variables according to the chosen AI provider:

| Variable | Description |
| --- | --- |
| `AI_PROVIDER` | AI provider (`bedrock`, `openai`, or `gemini`) |
| `BEDROCK_MODEL_ID` | Bedrock model for summaries |
| `BEDROCK_TOKEN_CAP` | Maximum tokens per user per week (Bedrock) |
| `BEDROCK_COST_CAP` | Maximum cost per user per week (Bedrock) |
| `BEDROCK_SUMMARY_TOKEN_LIMIT` | Token limit for generated summaries (Bedrock) |
| `BEDROCK_COST_PER_1K` | Cost in USD per 1K tokens (Bedrock) |
| `OPENAI_MODEL_ID` | OpenAI model for summaries |
| `OPENAI_TOKEN_CAP` | Maximum tokens per user per week (OpenAI) |
| `OPENAI_COST_CAP` | Maximum cost per user per week (OpenAI) |
| `OPENAI_SUMMARY_TOKEN_LIMIT` | Token limit for generated summaries (OpenAI) |
| `OPENAI_COST_PER_1K` | Cost in USD per 1K tokens (OpenAI) |
| `GEMINI_MODEL_ID` | Gemini model for summaries |
| `GEMINI_TOKEN_CAP` | Maximum tokens per user per week (Gemini) |
| `GEMINI_COST_CAP` | Maximum cost per user per week (Gemini) |
| `GEMINI_SUMMARY_TOKEN_LIMIT` | Token limit for generated summaries (Gemini) |
| `GEMINI_COST_PER_1K` | Cost in USD per 1K tokens (Gemini) |
| `BUCKET_NAME` | Target bucket for results |

## Repository variables and secrets

Set the following in GitHub before running workflows.

### Variables

| Variable | Description |
| --- | --- |
| `AWS_ACCOUNT_ID` | AWS account to deploy into |
| `AWS_REGION` | AWS region for all stacks |
| `DOMAIN_NAME` | Root domain name for the application |
| `HOSTED_ZONE_ID` | Route53 hosted zone ID |
| `AI_PROVIDER` | AI provider for weekly summaries |
| `ENABLE_WEEKLY_LAMBDA` | `true` to deploy the scheduled summary Lambda |
| `BEDROCK_TOKEN_CAP` | Maximum Bedrock tokens per user per week |
| `BEDROCK_COST_CAP` | Maximum Bedrock cost per user per week (USD) |
| `BEDROCK_COST_PER_1K` | Bedrock cost in USD per 1K tokens |

### Secrets

- `AWS_ROLE_ARN` – IAM role assumed by GitHub Actions for deployments
- `OPENAI_API_KEY` – required when `AI_PROVIDER` is `openai`
- `GEMINI_API_KEY` – required when `AI_PROVIDER` is `gemini`

## Local development

1. Install dependencies:
   ```bash
   yarn install
   ```
2. Start the web client in development mode:
   ```bash
   yarn workspace web dev
   ```
3. Build and deploy the infrastructure for a given domain and hosted zone:
   ```bash
   yarn workspace infra build
   yarn workspace infra cdk deploy --all -c domain=<DOMAIN> -c hostedZoneId=<ZONE_ID>
   ```
4. Write the runtime configuration and upload the web build to S3:
   ```bash
   yarn workspace infra postdeploy
   ```
5. Run tests across all packages:
   ```bash
   yarn test
   ```

## Deploy and destroy workflows

### Deploy

After configuring repository variables and secrets, trigger the deployment workflow:

```bash
gh workflow run deploy.yml
```

The workflow runs tests, deploys the CDK stacks, builds the web client, and uploads assets to S3. The CloudFront distribution URL is printed in the workflow summary.

### Destroy

To tear everything down, trigger the destroy workflow:

```bash
gh workflow run destroy.yml
```

This empties S3 buckets and destroys all CDK stacks for the configured domain and hosted zone.

## Optional components

### Social connectors

Enable Google, Microsoft or Apple sign-in by storing OAuth credentials in AWS Systems Manager Parameter Store before deployment:

| Parameter | Description |
| --- | --- |
| `google-client-id` | Google OAuth client ID |
| `google-client-secret` | Google OAuth client secret |
| `microsoft-client-id` | Microsoft application ID |
| `microsoft-client-secret` | Microsoft client secret |
| `apple-client-id` | Apple Services ID |
| `apple-team-id` | Apple developer team ID |
| `apple-key-id` | Apple key ID |
| `apple-private-key` | Contents of the Apple `.p8` private key |

Example commands:

```bash
aws ssm put-parameter --name google-client-id --type String --value <GOOGLE_CLIENT_ID>
aws ssm put-parameter --name google-client-secret --type SecureString --value <GOOGLE_CLIENT_SECRET>
aws ssm put-parameter --name microsoft-client-id --type String --value <MICROSOFT_CLIENT_ID>
aws ssm put-parameter --name microsoft-client-secret --type SecureString --value <MICROSOFT_CLIENT_SECRET>
aws ssm put-parameter --name apple-client-id --type String --value <APPLE_CLIENT_ID>
aws ssm put-parameter --name apple-team-id --type String --value <APPLE_TEAM_ID>
aws ssm put-parameter --name apple-key-id --type String --value <APPLE_KEY_ID>
aws ssm put-parameter --name apple-private-key --type SecureString --value "$(cat AuthKey.p8)"
```

Ensure the GitHub Actions role has `ssm:GetParameter` (and `kms:Decrypt` for secure strings).

### Weekly AI summaries

Deploy `packages/infra/lib/weekly-review-stack.ts` and set the environment variables above to enable weekly AI-generated summaries. Omit the stack to disable the feature.

