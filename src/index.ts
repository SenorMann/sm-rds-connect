import { App, Duration, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import {
  AmazonLinuxCpuType,
  Instance,
  InstanceClass,
  InstanceSize,
  InstanceType,
  InterfaceVpcEndpointAwsService,
  IpAddresses,
  MachineImage,
  Peer,
  Port,
  SecurityGroup,
  SubnetType,
  Vpc
} from "aws-cdk-lib/aws-ec2";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { Credentials, DatabaseInstance, DatabaseInstanceEngine, DatabaseSecret, PostgresEngineVersion } from "aws-cdk-lib/aws-rds";
import { Construct } from "constructs";

class RootStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const vpc = new Vpc(this, "vpc", {
      ipAddresses: IpAddresses.cidr("10.0.0.0/24"),
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "private",
          subnetType: SubnetType.PRIVATE_ISOLATED,
        },
        {
          name: "public",
          subnetType: SubnetType.PUBLIC,
        },
      ],
    });

    vpc.addInterfaceEndpoint('ssm-messages', {
      service: InterfaceVpcEndpointAwsService.SSM_MESSAGES,
      subnets: vpc.selectSubnets({ subnetType: SubnetType.PRIVATE_ISOLATED }),
    });

    vpc.addInterfaceEndpoint('ssm', {
      service: InterfaceVpcEndpointAwsService.SSM,
      subnets: vpc.selectSubnets({ subnetType: SubnetType.PRIVATE_ISOLATED }),
    });

    const bastionServerSecurityGroup = new SecurityGroup(this, "bastion-server-sg", {
      allowAllOutbound: false,
      vpc,
    });

    const databaseSecret = new DatabaseSecret(this, "database-credentials", {
      username: "malik",
      dbname: "test",
    });

    const databaseSecurityGroup = new SecurityGroup(this, "database-security-group", {
      allowAllOutbound: false,
      vpc,
    });

    bastionServerSecurityGroup.addEgressRule(Peer.ipv4(vpc.vpcCidrBlock), Port.tcp(5432), "Allow egress to Database");
    bastionServerSecurityGroup.addEgressRule(Peer.ipv4(vpc.vpcCidrBlock), Port.tcp(443), "Allow egress to SSM endpoint");
    databaseSecurityGroup.addIngressRule(bastionServerSecurityGroup, Port.tcp(5432), "Allow ingress from bastion server");

    new DatabaseInstance(this, "database", {
      allocatedStorage: 5,
      backupRetention: Duration.days(0),
      cloudwatchLogsRetention: RetentionDays.ONE_DAY,
      credentials: Credentials.fromSecret(databaseSecret),
      engine: DatabaseInstanceEngine.postgres({ version: PostgresEngineVersion.VER_15_5 }),
      iamAuthentication: true,
      instanceType: InstanceType.of(InstanceClass.T4G, InstanceSize.MICRO),
      multiAz: false,
      port: 5432,
      removalPolicy: RemovalPolicy.DESTROY,
      securityGroups: [databaseSecurityGroup],
      storageEncrypted: true,
      vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_ISOLATED },
    });

    new Instance(this, "bastion-server", {
      allowAllOutbound: false,
      instanceType: InstanceType.of(InstanceClass.T4G, InstanceSize.MICRO),
      machineImage: MachineImage.latestAmazonLinux2023({
        cachedInContext: false,
        cpuType: AmazonLinuxCpuType.ARM_64,
      }),
      securityGroup: bastionServerSecurityGroup,
      ssmSessionPermissions: true,
      vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_ISOLATED },
    });
  }
}

const app = new App();
new RootStack(app, "vpc-endpoint-stack", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});

