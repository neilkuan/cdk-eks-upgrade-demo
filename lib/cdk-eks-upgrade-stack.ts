import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { KubectlV23Layer } from '@aws-cdk/lambda-layer-kubectl-v23';

export class CdkEksUpgradeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const cluster = new eks.Cluster(this, 'Cluster', {
      version: eks.KubernetesVersion.V1_23,
      // version: eks.KubernetesVersion.V1_24,
      kubectlLayer: new KubectlV23Layer(this, 'KubectlV23Layer'),
      defaultCapacity: 0,
    });
    
    /**
     * 1.23 default container runtime is dockerd
     */
    cluster.addNodegroupCapacity('1-23MNG',{
      minSize: 1,
      maxSize: 2,
      instanceTypes: [new ec2.InstanceType('t3.medium')],
    });

    /**
     * 使用 Custom UserDate enabled containerd as container runtime interface.
     * 在 Cluster 升級到 1.24 後，預設所啟動的 Managed Node Group 會預設啟用 Containerd 當作 container runtime interface.
     * https://github.com/awslabs/amazon-eks-ami/blob/91c6002ff1b3b11e59941aad7417dc91dcf665ef/files/bootstrap.sh#L199
     * sed -i 's/\${CONTAINER_RUNTIME:-$DEFAULT_CONTAINER_RUNTIME}/containerd/' /etc/eks/bootstrap.sh
     */
    const userData = `MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="==MYBOUNDARY=="

--==MYBOUNDARY==
Content-Type: text/x-shellscript; charset="us-ascii"

#!/bin/bash
sed -i 's/\${CONTAINER_RUNTIME:-$DEFAULT_CONTAINER_RUNTIME}/containerd/' /etc/eks/bootstrap.sh
--==MYBOUNDARY==--\\
`;
    const lt = new ec2.CfnLaunchTemplate(this, 'LaunchTemplate', {
      launchTemplateData: { userData: cdk.Fn.base64(userData) } } );

    cluster.addNodegroupCapacity('1-23MNGContainerd', {
      instanceTypes: [new ec2.InstanceType('t3.medium')],
      minSize: 1,
      maxSize: 2,
      launchTemplateSpec: {
        id: lt.ref,
        version: lt.attrLatestVersionNumber,
      },
      taints: [{
        effect: eks.TaintEffect.NO_SCHEDULE,
        value: 'true',
        key: 'taints',
      }],
    });

    // cluster.addNodegroupCapacity('1-23MNGContainerd', {
    //   instanceTypes: [new ec2.InstanceType('t3.medium')],
    //   minSize: 1,
    //   maxSize: 2,
    //   launchTemplateSpec: {
    //     id: lt.ref,
    //     version: lt.attrLatestVersionNumber,
    //   },
    // });

    // cluster.addNodegroupCapacity('1-24MNGContainerd', {
    //   instanceTypes: [new ec2.InstanceType('t3.medium')],
    //   minSize: 1,
    //   maxSize: 2,
    //   taints: [{
    //     effect: eks.TaintEffect.NO_SCHEDULE,
    //     value: 'true',
    //     key: 'taints',
    //   }],
    // });

    // cluster.addNodegroupCapacity('1-24MNGContainerd', {
    //   instanceTypes: [new ec2.InstanceType('t3.medium')],
    //   minSize: 1,
    //   maxSize: 2,
    // });

    /**
     * Replace to your aws iam user name.
     */
    cluster.awsAuth.addUserMapping(iam.User.fromUserName(this, 'neil', 'neil'), { groups: ['system:masters'] });
  }
}
