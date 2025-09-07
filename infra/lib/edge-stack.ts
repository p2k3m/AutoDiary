import { Stack, StackProps, aws_certificatemanager as acm } from 'aws-cdk-lib';
import { Construct } from 'constructs';

interface EdgeStackProps extends StackProps {
  domain: string;
}

export class EdgeStack extends Stack {
  public readonly certArn: string;

  constructor(scope: Construct, id: string, props: EdgeStackProps) {
    super(scope, id, { env: { region: 'us-east-1' } });

    const cert = new acm.Certificate(this, 'SiteCert', {
      domainName: props.domain,
      subjectAlternativeNames: [`www.${props.domain}`],
      validation: acm.CertificateValidation.fromDns(),
    });

    this.certArn = cert.certificateArn;
  }
}
