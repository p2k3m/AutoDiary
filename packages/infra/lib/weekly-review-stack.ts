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

    const tokenTable = new dynamodb.Table(this, 'WeeklyReviewTokens', {
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    const fn = new lambdaNodejs.NodejsFunction(this, 'WeeklyReviewFunction', {
      functionName: 'weekly-review',
      entry: path.join(__dirname, '../functions/weekly-review.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: Duration.minutes(15),
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
        BEDROCK_MODEL_ID:
          this.node.tryGetContext('bedrockModelId') ||
          process.env.BEDROCK_MODEL_ID ||
          'anthropic.claude-v2',
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
        AI_PROVIDER:
          this.node.tryGetContext('aiProvider') ||
          process.env.AI_PROVIDER ||
          'bedrock',
      },
    });

    // Allow listing of objects under the private/ prefix
    props.bucket.grantRead(fn);
    props.bucket.grantRead(fn, 'private/*/entries/*');
    props.bucket.grantRead(fn, 'private/*/connectors/*');
    props.bucket.grantReadWrite(fn, 'private/*/weekly/*');

    tokenTable.grantReadWriteData(fn);

    const fnUrl = fn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM,
    });

    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-v2`,
        ],
      })
    );

    const rule = new events.Rule(this, 'WeeklyReviewSchedule', {
      schedule: events.Schedule.cron({ weekDay: 'SUN', hour: '19', minute: '0' }),
    });

    rule.addTarget(new targets.LambdaFunction(fn));

    new CfnOutput(this, 'WeeklyReviewFunctionUrl', { value: fnUrl.url });
  }
}
