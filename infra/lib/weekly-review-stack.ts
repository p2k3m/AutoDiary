import {
  Stack,
  StackProps,
  Duration,
  aws_lambda as lambda,
  aws_lambda_nodejs as lambdaNodejs,
  aws_events as events,
  aws_events_targets as targets,
  aws_ssm as ssm,
  aws_s3 as s3,
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

    const openAiParam = ssm.StringParameter.fromStringParameterName(
      this,
      'OpenAIKey',
      'openai-key'
    );

    const fn = new lambdaNodejs.NodejsFunction(this, 'WeeklyReviewFunction', {
      functionName: 'weekly-review',
      entry: path.join(__dirname, '../functions/weekly-review.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: Duration.minutes(15),
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
        OPENAI_KEY_PARAM: openAiParam.parameterName,
      },
    });

    fn.addFunctionUrl({ authType: lambda.FunctionUrlAuthType.AWS_IAM });

    props.bucket.grantReadWrite(fn);
    openAiParam.grantRead(fn);

    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [openAiParam.parameterArn],
      })
    );

    const rule = new events.Rule(this, 'WeeklyReviewSchedule', {
      schedule: events.Schedule.cron({ weekDay: 'SUN', hour: '19', minute: '0' }),
    });

    rule.addTarget(new targets.LambdaFunction(fn));
  }
}
