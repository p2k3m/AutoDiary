import {
  Stack,
  StackProps,
  aws_s3 as s3,
  aws_cloudfront as cf,
  aws_cloudfront_origins as origins,
  aws_certificatemanager as acm,
  aws_route53 as r53,
  aws_route53_targets as targets,
  aws_cognito as cognito,
  aws_iam as iam,
  aws_ssm as ssm,
  Duration,
  CfnOutput,
  SecretValue,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

interface AppStackProps extends StackProps {
  domain: string;
  hostedZoneId: string;
  certArn: string;
  hostedZoneName?: string;
}

export class AppStack extends Stack {
  public readonly userBucket: s3.Bucket;
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);

    const sanitizedDomain = props.domain.replace(/\./g, '-');

    const webBucket = new s3.Bucket(this, 'WebBucket', {
      bucketName: `web-${sanitizedDomain}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    const userBucket = new s3.Bucket(this, 'UserBucket', {
      bucketName: `userdata-${sanitizedDomain}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.HEAD],
          allowedOrigins: [
            `https://${props.domain}`,
            `https://www.${props.domain}`,
          ],
          allowedHeaders: ['*'],
        },
      ],
    });
    this.userBucket = userBucket;

    const distro = new cf.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(webBucket),
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.seconds(0),
        },
      ],
      priceClass: cf.PriceClass.PRICE_CLASS_100,
      certificate: acm.Certificate.fromCertificateArn(this, 'Cert', props.certArn),
      domainNames: [props.domain, `www.${props.domain}`],
    });

    const parts = props.domain.split('.');
    const rootDomain =
      props.hostedZoneName ||
      (parts.length > 2 ? parts.slice(1).join('.') : props.domain);

    const zone = r53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId: props.hostedZoneId,
      zoneName: rootDomain,
    });

    new r53.ARecord(this, 'Alias', {
      zone,
      recordName: props.domain,
      target: r53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distro)),
    });

    new r53.AaaaRecord(this, 'AliasAAAA', {
      zone,
      recordName: props.domain,
      target: r53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distro)),
    });

    const userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: false,
    });

    const googleClientId = ssm.StringParameter.valueForStringParameter(
      this,
      'google-client-id'
    );
    const googleClientSecret = ssm.StringParameter.valueForStringParameter(
      this,
      'google-client-secret'
    );
    const appleClientId = ssm.StringParameter.valueForStringParameter(
      this,
      'apple-client-id'
    );
    const appleTeamId = ssm.StringParameter.valueForStringParameter(
      this,
      'apple-team-id'
    );
    const appleKeyId = ssm.StringParameter.valueForStringParameter(
      this,
      'apple-key-id'
    );
    const applePrivateKey = ssm.StringParameter.valueForStringParameter(
      this,
      'apple-private-key'
    );
    const microsoftClientId = ssm.StringParameter.valueForStringParameter(
      this,
      'microsoft-client-id'
    );
    const microsoftClientSecret = ssm.StringParameter.valueForStringParameter(
      this,
      'microsoft-client-secret'
    );

    const googleProvider = new cognito.UserPoolIdentityProviderGoogle(
      this,
      'Google',
      {
        userPool,
        clientId: googleClientId,
        clientSecret: googleClientSecret,
      }
    );

    const appleProvider = new cognito.UserPoolIdentityProviderApple(this, 'Apple', {
      userPool,
      clientId: appleClientId,
      teamId: appleTeamId,
      keyId: appleKeyId,
      privateKeyValue: SecretValue.unsafePlainText(applePrivateKey),
    });

    const microsoftProvider = new cognito.UserPoolIdentityProviderOidc(
      this,
      'Microsoft',
      {
        userPool,
        clientId: microsoftClientId,
        clientSecret: microsoftClientSecret,
        issuerUrl: 'https://login.microsoftonline.com/common/v2.0',
        name: 'microsoft',
      }
    );

    const userPoolClient = userPool.addClient('web', {
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
        cognito.UserPoolClientIdentityProvider.GOOGLE,
        cognito.UserPoolClientIdentityProvider.APPLE,
        cognito.UserPoolClientIdentityProvider.custom('microsoft'),
      ],
    });

    userPoolClient.node.addDependency(googleProvider);
    userPoolClient.node.addDependency(appleProvider);
    userPoolClient.node.addDependency(microsoftProvider);

    const identityPool = new cognito.CfnIdentityPool(this, 'IdentityPool', {
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [
        {
          clientId: userPoolClient.userPoolClientId,
          providerName: userPool.userPoolProviderName,
        },
      ],
      supportedLoginProviders: {
        'accounts.google.com': googleClientId,
        'appleid.apple.com': appleClientId,
        'login.microsoftonline.com': microsoftClientId,
      },
    });

    const authRole = new iam.Role(this, 'AuthRole', {
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: { 'cognito-identity.amazonaws.com:aud': identityPool.ref },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
    });

    authRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject', 's3:PutObject'],
        resources: [
          userBucket.arnForObjects(
            'private/${cognito-identity.amazonaws.com:sub}/*'
          ),
        ],
      })
    );

    authRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['s3:ListBucket'],
        resources: [userBucket.bucketArn],
        conditions: {
          StringLike: {
            's3:prefix': 'private/${cognito-identity.amazonaws.com:sub}/*',
          },
        },
      })
    );

    new cognito.CfnIdentityPoolRoleAttachment(this, 'RoleAttach', {
      identityPoolId: identityPool.ref,
      roles: { authenticated: authRole.roleArn },
    });

    new CfnOutput(this, 'CloudFrontDistributionUrl', {
      value: `https://${distro.distributionDomainName}`,
    });

    new CfnOutput(this, 'CloudFrontDistributionDomain', {
      value: distro.distributionDomainName,
    });

    new CfnOutput(this, 'CloudFrontDistributionId', {
      value: distro.distributionId,
    });

    new CfnOutput(this, 'Domain', { value: props.domain });

    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });

    new CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
    });

    new CfnOutput(this, 'IdentityPoolId', { value: identityPool.ref });

    new CfnOutput(this, 'WebBucketName', { value: webBucket.bucketName });

    new CfnOutput(this, 'UserdataBucketName', { value: userBucket.bucketName });
  }
}
