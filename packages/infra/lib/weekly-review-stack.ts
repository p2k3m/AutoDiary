import {
  Stack,
  StackProps,
  Duration,
  aws_lambda as lambda,
  aws_lambda_nodejs as lambdaNodejs,
  aws_events as events,
  aws_events_targets as targets,
  aws_s3 as s3,
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

    const fn = new lambdaNodejs.NodejsFunction(this, 'WeeklyReviewFunction', {
      functionName: 'weekly-review',
      entry: path.join(__dirname, '../functions/weekly-review.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: Duration.minutes(15),
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
        BEDROCK_MODEL_ID: 'anthropic.claude-v2',
        USER_TOKEN_CAP: '10000',
        SUMMARY_TOKEN_LIMIT: '1000',
      },
      bundling: {
        externalModules: ['@aws-sdk/client-bedrock-runtime'],
      },
    });

    const fnUrl = fn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM,
    });

    props.bucket.grantRead(fn, '*/entries/*');
    props.bucket.grantRead(fn, '*/connectors/*');
    props.bucket.grantReadWrite(fn, '*/weekly/*');

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
