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
  domain?: string;
  hostedZoneId?: string;
  certArn?: string;
  hostedZoneName?: string;
}

export class AppStack extends Stack {
  public readonly userBucket: s3.Bucket;
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);

    const sanitizedDomain = props.domain?.replace(/\./g, '-');

    const webBucket = new s3.Bucket(this, 'WebBucket', {
      bucketName: sanitizedDomain ? `web-${sanitizedDomain}` : undefined,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
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
      ...(props.domain && props.certArn
        ? {
            certificate: acm.Certificate.fromCertificateArn(
              this,
              'Cert',
              props.certArn
            ),
            domainNames: [props.domain, `www.${props.domain}`],
          }
        : {}),
    });

    const userBucket = new s3.Bucket(this, 'UserBucket', {
      bucketName: sanitizedDomain ? `userdata-${sanitizedDomain}` : undefined,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.HEAD,
            s3.HttpMethods.DELETE,
          ],
          allowedOrigins: props.domain
            ? [
                `https://${props.domain}`,
                `https://www.${props.domain}`,
              ]
            : [`https://${distro.distributionDomainName}`],
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag'],
        },
      ],
    });
    this.userBucket = userBucket;

    if (props.domain && props.hostedZoneId) {
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

      new r53.ARecord(this, 'AliasWWW', {
        zone,
        recordName: `www.${props.domain}`,
        target: r53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distro)),
      });

      new r53.AaaaRecord(this, 'AliasAAAAWWW', {
        zone,
        recordName: `www.${props.domain}`,
        target: r53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distro)),
      });
    }

    const userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: false,
    });

    const userPoolDomain = userPool.addDomain('HostedUiDomain', {
      cognitoDomain: {
        domainPrefix: `autodiary-${sanitizedDomain ?? this.stackName.toLowerCase()}`,
      },
    });

    const lookup = (name: string): string | undefined => {
      try {
        return ssm.StringParameter.valueForStringParameter(this, name);
      } catch {
        return undefined;
      }
    };

    const googleClientId = lookup('google-client-id');
    const googleClientSecret = lookup('google-client-secret');
    const appleClientId = lookup('apple-client-id');
    const appleTeamId = lookup('apple-team-id');
    const appleKeyId = lookup('apple-key-id');
    const applePrivateKey = lookup('apple-private-key');
    const microsoftClientId = lookup('microsoft-client-id');
    const microsoftClientSecret = lookup('microsoft-client-secret');

    const supportedIdentityProviders: cognito.UserPoolClientIdentityProvider[] = [
      cognito.UserPoolClientIdentityProvider.COGNITO,
    ];
    const supportedLoginProviders: Record<string, string> = {};

    let googleProvider: cognito.UserPoolIdentityProviderGoogle | undefined;
    if (googleClientId && googleClientSecret) {
      googleProvider = new cognito.UserPoolIdentityProviderGoogle(this, 'Google', {
        userPool,
        clientId: googleClientId,
        clientSecret: googleClientSecret,
      });
      supportedIdentityProviders.push(
        cognito.UserPoolClientIdentityProvider.GOOGLE
      );
      supportedLoginProviders['accounts.google.com'] = googleClientId;
    }

    let appleProvider: cognito.UserPoolIdentityProviderApple | undefined;
    if (appleClientId && appleTeamId && appleKeyId && applePrivateKey) {
      appleProvider = new cognito.UserPoolIdentityProviderApple(this, 'Apple', {
        userPool,
        clientId: appleClientId,
        teamId: appleTeamId,
        keyId: appleKeyId,
        privateKeyValue: SecretValue.unsafePlainText(applePrivateKey),
      });
      supportedIdentityProviders.push(
        cognito.UserPoolClientIdentityProvider.APPLE
      );
      supportedLoginProviders['appleid.apple.com'] = appleClientId;
    }

    let microsoftProvider: cognito.UserPoolIdentityProviderOidc | undefined;
    if (microsoftClientId && microsoftClientSecret) {
      microsoftProvider = new cognito.UserPoolIdentityProviderOidc(
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
      supportedIdentityProviders.push(
        cognito.UserPoolClientIdentityProvider.custom('microsoft')
      );
      supportedLoginProviders['login.microsoftonline.com'] =
        microsoftClientId;
    }

    const userPoolClient = userPool.addClient('web', {
      supportedIdentityProviders,
    });

    if (googleProvider) {
      userPoolClient.node.addDependency(googleProvider);
    }
    if (appleProvider) {
      userPoolClient.node.addDependency(appleProvider);
    }
    if (microsoftProvider) {
      userPoolClient.node.addDependency(microsoftProvider);
    }

    const identityPool = new cognito.CfnIdentityPool(this, 'IdentityPool', {
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [
        {
          clientId: userPoolClient.userPoolClientId,
          providerName: userPool.userPoolProviderName,
        },
      ],
      ...(Object.keys(supportedLoginProviders).length > 0
        ? { supportedLoginProviders }
        : {}),
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

    if (props.domain) {
      new CfnOutput(this, 'Domain', { value: props.domain });
    }

    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });

    new CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
    });

    new CfnOutput(this, 'HostedUiDomain', {
      value: userPoolDomain.domainName,
    });

    new CfnOutput(this, 'IdentityPoolId', { value: identityPool.ref });

    new CfnOutput(this, 'WebBucketName', { value: webBucket.bucketName });

    new CfnOutput(this, 'UserdataBucketName', { value: userBucket.bucketName });
  }
}
