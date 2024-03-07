import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as lambda from "aws-cdk-lib/aws-lambda"
import { Duration, Stack } from "aws-cdk-lib";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { AwsCustomResource, AwsCustomResourcePolicy, AwsSdkCall, PhysicalResourceId } from "aws-cdk-lib/custom-resources";
import { createHash } from "node:crypto";
import { PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs"

export interface CdkResourceInitializerProps {
  dbSecretName: string;
  entry: string;
  vpc: ec2.IVpc
  depsLockFilePath: string;
  subnetsSelection: ec2.SubnetSelection
  fnSecurityGroups: ec2.ISecurityGroup[]
  fnTimeout: Duration
  fnLogRetention: RetentionDays
  fnMemorySize?: number
  config: any
}

export default class CdkResourceInitializer extends Construct {
  public readonly response: string
  public readonly customResource: AwsCustomResource
  public readonly function: lambda.Function

  constructor(scope: Construct, id: string, props: CdkResourceInitializerProps) {
    super(scope, id)

    const stack = Stack.of(this);

    const resourceInitializerFn = new NodejsFunction(this, "resource-initializer-fn", {
      architecture: lambda.Architecture.X86_64,
      environment: {
        SECRET_NAME: props.dbSecretName,
      },
      entry: props.entry,
      depsLockFilePath: props.depsLockFilePath,
      logRetention: props.fnLogRetention,
      memorySize: props.fnMemorySize,
      securityGroups: props.fnSecurityGroups,
      timeout: props.fnTimeout,
      runtime: lambda.Runtime.NODEJS_20_X,
      vpc: props.vpc,
      vpcSubnets: props.vpc.selectSubnets(props.subnetsSelection),
    })

    const payload: string = JSON.stringify({
      params: {
        config: props.config
      }
    })

    const payloadHashPrefix = createHash('md5').update(payload).digest('hex').substring(0, 6)

    const sdkCall: AwsSdkCall = {
      service: 'Lambda',
      action: 'invoke',
      parameters: {
        FunctionName: resourceInitializerFn.functionName,
        Payload: payload
      },
      physicalResourceId: PhysicalResourceId.of(`${id}-AwsSdkCall-${resourceInitializerFn.currentVersion.version + payloadHashPrefix}`)
    }

    const customResourceFnRole = new Role(this, 'AwsCustomResourceRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com')
    });

    customResourceFnRole.addToPolicy(
      new PolicyStatement({
        resources: [`arn:aws:lambda:${stack.region}:${stack.account}:function:*-ResInit${stack.stackName}`],
        actions: ['lambda:InvokeFunction']
      })
    );

    this.customResource = new AwsCustomResource(this, 'AwsCustomResource', {
      policy: AwsCustomResourcePolicy.fromSdkCalls({ resources: AwsCustomResourcePolicy.ANY_RESOURCE }),
      onUpdate: sdkCall,
      timeout: Duration.minutes(5),
      role: customResourceFnRole
    });

    this.response = this.customResource.getResponseField('Payload');

    this.function = resourceInitializerFn;
  }
}