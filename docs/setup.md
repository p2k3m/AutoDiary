# Setup Guide

This guide covers prerequisites, configuration and deployment of AutoDiary.

## Prerequisites

- Node.js 20+
- Yarn 4+
- AWS account with permissions to deploy CDK stacks
- AWS CLI configured locally
- (Optional) [GitHub CLI](https://cli.github.com/) for triggering workflows

### AWS resource prerequisites

AutoDiary requires a domain managed in Amazon Route 53 and relies on Amazon Cognito for authentication.

1. **Register or import a domain in Route 53**
   - Console: follow [Registering a new domain](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/domain-register.html) or [Migrating DNS service to Amazon Route 53](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/migrate-dns-domain-inactive.html).
   - CLI example to register:
     ```bash
     aws route53domains register-domain --domain-name example.com --duration-in-years 1
     ```
   - Verify the registration:
     ```bash
     aws route53domains get-domain-detail --domain-name example.com
     ```
2. **Create a public hosted zone**
   - Console: follow [Creating a public hosted zone](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/CreatingHostedZone.html)
   - CLI example:
     ```bash
     aws route53 create-hosted-zone --name example.com --caller-reference $(uuidgen)
     ```
   - If you imported an existing domain, update your registrar's nameserver records to those provided by Route 53.
3. **Retrieve the hosted zone ID**
   - CLI example:
     ```bash
     aws route53 list-hosted-zones-by-name --dns-name example.com --query "HostedZones[0].Id" --output text
     ```
   - Use this value for the `HOSTED_ZONE_ID` repository variable.

The CDK stack provisions the Amazon Cognito User Pool, Identity Pool, and Hosted UI automatically. To enable optional social logins (Google, Microsoft or Apple), store the corresponding OAuth credentials in AWS Systems Manager Parameter Store as described in [Social connectors](#social-connectors).

## Configuration

### Web client (`app-config.json`)

The web client loads settings from `packages/web/app-config.json`. Copy the example and edit the fields:

```bash
cp packages/web/app-config.example.json packages/web/app-config.json
```

After deploying the stacks, generate the file automatically and upload the build:

```bash
yarn workspace infra postdeploy
```

The file is served as `/app-config.json` and the example defaults to `ap-south-1`.

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
All variables and secrets below must exist in your repository before any workflow runs.

Create them through either the GitHub web UI or the `gh` CLI:

1. **GitHub UI**
   - Navigate to *Settings → Secrets and variables → Actions*.
   - Add each entry under the **Variables** or **Secrets** tab.
2. **GitHub CLI**
   ```bash
   gh variable set AWS_ACCOUNT_ID --body <id>
   gh secret set AWS_ROLE_ARN --body <arn>
   ```

See the GitHub docs for managing [actions variables](https://docs.github.com/actions/using-workflows/managing-variables) and [secrets](https://docs.github.com/actions/security-guides/encrypted-secrets).

### Variables

Workflows default to the `ap-south-1` region; set `AWS_REGION` to override.

| Variable | Description |
| --- | --- |
| `AWS_ACCOUNT_ID` | AWS account to deploy into |
| `AWS_REGION` | AWS region for all stacks (defaults to `ap-south-1`) |
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
2. Start the web client in development mode (requires `packages/web/app-config.json`):
   ```bash
   yarn workspace web dev
   ```
3. Build and deploy the infrastructure for a given domain and hosted zone:
   ```bash
   yarn workspace infra build
   yarn workspace infra cdk deploy --all -c domain=<DOMAIN> -c hostedZoneId=<ZONE_ID>
   ```
4. Generate `packages/web/app-config.json` and upload the web build to S3:
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

The workflow runs tests, deploys the CDK stacks, generates `app-config.json`, builds the web client, and uploads assets to S3. The CloudFront distribution URL is printed in the workflow summary.

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

