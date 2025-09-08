import {
  Stack,
  StackProps,
  Duration,
  aws_lambda as lambda,
  aws_lambda_nodejs as lambdaNodejs,
  aws_events as events,
  aws_events_targets as targets,
  aws_s3 as s3,
  aws_dynamodb as dynamodb,
  CfnOutput,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';

interface WeeklyReviewStackProps extends StackProps {
  bucket: s3.IBucket;
}

export class WeeklyReviewStack extends Stack {
  constructor(scope: Construct, id: string, props: WeeklyReviewStackProps) {
    super(scope, id, props);

    const bedrockModelId =
      this.node.tryGetContext('bedrockModelId') ||
      process.env.BEDROCK_MODEL_ID ||
      'anthropic.claude-v2';

    const aiProvider =
      this.node.tryGetContext('aiProvider') ||
      process.env.AI_PROVIDER ||
      'bedrock';

    const tokenTable = new dynamodb.Table(this, 'WeeklyReviewTokens', {
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expireAt',
    });

    const environment: Record<string, string> = {
      BUCKET_NAME: props.bucket.bucketName,
      BEDROCK_MODEL_ID: bedrockModelId,
      BEDROCK_TOKEN_CAP:
        this.node.tryGetContext('bedrockTokenCap') ||
        process.env.BEDROCK_TOKEN_CAP ||
        '10000',
      BEDROCK_SUMMARY_TOKEN_LIMIT:
        this.node.tryGetContext('bedrockSummaryTokenLimit') ||
        process.env.BEDROCK_SUMMARY_TOKEN_LIMIT ||
        '1000',
      BEDROCK_COST_CAP:
        this.node.tryGetContext('bedrockCostCap') ||
        process.env.BEDROCK_COST_CAP ||
        '0',
      BEDROCK_COST_PER_1K:
        this.node.tryGetContext('bedrockCostPer1k') ||
        process.env.BEDROCK_COST_PER_1K ||
        '0',
      TOKEN_TABLE_NAME: tokenTable.tableName,
      AI_PROVIDER: aiProvider,
    };

    if (aiProvider === 'openai') {
      environment.OPENAI_API_KEY =
        this.node.tryGetContext('openaiApiKey') ||
        process.env.OPENAI_API_KEY ||
        '';
      environment.OPENAI_TOKEN_CAP =
        this.node.tryGetContext('openaiTokenCap') ||
        process.env.OPENAI_TOKEN_CAP ||
        '10000';
      environment.OPENAI_SUMMARY_TOKEN_LIMIT =
        this.node.tryGetContext('openaiSummaryTokenLimit') ||
        process.env.OPENAI_SUMMARY_TOKEN_LIMIT ||
        '1000';
      environment.OPENAI_COST_CAP =
        this.node.tryGetContext('openaiCostCap') ||
        process.env.OPENAI_COST_CAP ||
        '0';
      environment.OPENAI_COST_PER_1K =
        this.node.tryGetContext('openaiCostPer1k') ||
        process.env.OPENAI_COST_PER_1K ||
        '0';
    } else if (aiProvider === 'gemini') {
      environment.GEMINI_API_KEY =
        this.node.tryGetContext('geminiApiKey') ||
        process.env.GEMINI_API_KEY ||
        '';
      environment.GEMINI_TOKEN_CAP =
        this.node.tryGetContext('geminiTokenCap') ||
        process.env.GEMINI_TOKEN_CAP ||
        '10000';
      environment.GEMINI_SUMMARY_TOKEN_LIMIT =
        this.node.tryGetContext('geminiSummaryTokenLimit') ||
        process.env.GEMINI_SUMMARY_TOKEN_LIMIT ||
        '1000';
      environment.GEMINI_COST_CAP =
        this.node.tryGetContext('geminiCostCap') ||
        process.env.GEMINI_COST_CAP ||
        '0';
      environment.GEMINI_COST_PER_1K =
        this.node.tryGetContext('geminiCostPer1k') ||
        process.env.GEMINI_COST_PER_1K ||
        '0';
    }

    const fn = new lambdaNodejs.NodejsFunction(this, 'WeeklyReviewFunction', {
      functionName: 'weekly-review',
      entry: path.join(__dirname, '../functions/weekly-review.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: Duration.minutes(15),
      environment,
    });

    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:ListBucket'],
        resources: [props.bucket.bucketArn],
        conditions: { StringLike: { 's3:prefix': ['private/', 'private/*'] } },
      })
    );
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject'],
        resources: [props.bucket.arnForObjects('private/*')],
      })
    );
    props.bucket.grantReadWrite(fn, 'private/*/weekly/*');

    tokenTable.grantReadWriteData(fn);

    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: ['*'],
      })
    );

    const fnUrl = fn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM,
    });

    if (aiProvider === 'bedrock') {
      fn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['bedrock:InvokeModel'],
          resources: [
            `arn:aws:bedrock:${this.region}::foundation-model/${bedrockModelId}`,
          ],
        })
      );
    }

    const rule = new events.Rule(this, 'WeeklyReviewSchedule', {
      schedule: events.Schedule.cron({ weekDay: 'SUN', hour: '19', minute: '0' }),
    });

    rule.addTarget(new targets.LambdaFunction(fn));

    new CfnOutput(this, 'WeeklyReviewFunctionUrl', { value: fnUrl.url });
  }
}
