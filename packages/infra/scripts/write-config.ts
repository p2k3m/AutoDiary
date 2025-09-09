import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

async function main() {
  const region = process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || 'us-east-1';
  const client = new CloudFormationClient({ region });
  const { Stacks } = await client.send(new DescribeStacksCommand({ StackName: 'AppStack' }));
  const stack = Stacks?.[0];
  if (!stack) throw new Error('AppStack not found');

  const outputs: Record<string, string> = {};
  for (const o of stack.Outputs ?? []) {
    if (o.OutputKey && o.OutputValue) outputs[o.OutputKey] = o.OutputValue;
  }

  const config = {
    region,
    userPoolId: outputs['UserPoolId'] ?? '',
    userPoolClientId: outputs['UserPoolClientId'] ?? '',
    hostedUiDomain: outputs['HostedUiDomain'] ?? '',
    identityPoolId: outputs['IdentityPoolId'] ?? '',
    entryBucket: outputs['UserdataBucketName'] ?? '',
    testMode: false,
  };

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const configPath = path.resolve(__dirname, '../../web/dist/app-config.json');
  writeFileSync(configPath, JSON.stringify(config, null, 2));

  const webBucket = outputs['WebBucketName'];
  if (webBucket) {
    execSync(`aws s3 sync ../../web/dist s3://${webBucket}/ --delete`, {
      stdio: 'inherit',
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
