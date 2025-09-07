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
  Duration,
  SecretValue,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

interface AppStackProps extends StackProps {
  domain: string;
  hostedZoneId: string;
  certArn: string;
}

export class AppStack extends Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);

    const webBucket = new s3.Bucket(this, 'WebBucket', {
      bucketName: `web-${props.domain}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    const userBucket = new s3.Bucket(this, 'UserBucket', {
      bucketName: `userdata-${props.domain}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.HEAD],
          allowedOrigins: [`https://${props.domain}`],
          allowedHeaders: ['*'],
        },
      ],
    });

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

    const zone = r53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId: props.hostedZoneId,
      zoneName: props.domain,
    });

    new r53.ARecord(this, 'Alias', {
      zone,
      recordName: props.domain,
      target: r53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distro)),
    });

    const userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: false,
    });

    const googleProvider = new cognito.UserPoolIdentityProviderGoogle(
      this,
      'Google',
      {
        userPool,
        clientId: 'google-client-id',
        clientSecret: 'google-client-secret',
      }
    );

    const appleProvider = new cognito.UserPoolIdentityProviderApple(this, 'Apple', {
      userPool,
      clientId: 'apple-client-id',
      teamId: 'apple-team-id',
      keyId: 'apple-key-id',
      privateKeyValue: SecretValue.unsafePlainText('apple-private-key'),
    });

    const microsoftProvider = new cognito.UserPoolIdentityProviderOidc(
      this,
      'Microsoft',
      {
        userPool,
        clientId: 'microsoft-client-id',
        clientSecret: 'microsoft-client-secret',
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
        'accounts.google.com': 'google-client-id',
        'appleid.apple.com': 'apple-client-id',
        'login.microsoftonline.com': 'microsoft-client-id',
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
        actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
        resources: [
          userBucket.arnForObjects('private/${cognito-identity.amazonaws.com:sub}/*'),
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
  }
}
