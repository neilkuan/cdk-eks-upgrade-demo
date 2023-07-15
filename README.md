### What is [EKS](./AMAZON_EKS.md)?
# EKS 1.23 supported by Amazon EKS until October 11, 2023.
## This is sample repo supported by Amazon EKS until October 11, 2023. ([README.zh-tw.md](./README.zh-tw.md))
> This project is designed to demonstrate a way to test when an EKS 1.23 cluster is upgraded to EKS 1.24.
> 🚨 Disclaimer: This example is intended solely for demonstration and sharing of experiences. It does not have any endorsement from Amazon or the Kubernetes community. Please do not consider it an official guide, and we do not assume any liability for any losses incurred.🚨 


> Summary of prerequisites: [Kubernetes is deprecating Docker as a container runtime after v1.20](https://kubernetes.io/blog/2020/12/02/dont-panic-kubernetes-and-docker/).
> [Is Your Cluster Ready for v1.24?](https://kubernetes.io/blog/2022/03/31/ready-for-dockershim-removal/)
> [Container Runtimes](https://kubernetes.io/docs/setup/production-environment/container-runtimes/)

---

## Upgrade logic for Managed Node Groups (My approach):
- Therefore, when upgrading a v1.23 cluster to v1.24, it is recommended to first ensure that the currently used Docker-shim as the Container Network Interface (CRI) is in place.

1. If the current Managed Node Group is using Docker-shim, it is recommended to create a new `Managed Node Group` using `v1.23` with containerd as the CRI and apply a [taint](https://kubernetes.io/zh-cn/docs/concepts/scheduling-eviction/taint-and-toleration/). This can be declared within the [CDK](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_eks-readme.html#managed-node-groups)(cdk deploy).


    > If you are using the `amazon-eks-ami`` as the AMI for your Managed Node Group, and there is a [`bootstrap.sh``](https://github.com/awslabs/amazon-eks-ami/blob/91c6002ff1b3b11e59941aad7417dc91dcf665ef/files/bootstrap.sh#L196) script defined, `"$KUBELET_VERSION" gteq "1.24.0"`, the way to hack bootstrap.sh in amazon-eks-ami.
    ![](./docs//hack-bootstrap-shell.png)

![](./docs/step1.png)

---

2. To deploy your own applications to the new Managed Node Group with the specified [tolerations](https://kubernetes.io/docs/concepts/scheduling-eviction/taint-and-toleration/). 

---

3. To remove the taint from the new Managed Node Group, you can modify the CDK code and redeploy the stack using the `cdk deploy` command.
```ts
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
      // taints: [{
      //   effect: eks.TaintEffect.NO_SCHEDULE,
      //   value: 'true',
      //   key: 'taints',
      // }],
    });
```
![](./docs/step3.jpeg)

- 3-1. In pursuit of high availability, it is indeed recommended to ensure that stateless applications are deployed on every node within the cluster before proceeding with the following steps. This approach helps distribute the application workload across multiple nodes, increasing redundancy and fault tolerance. By having the application running on each node, you minimize the impact of node failures and improve the availability of the service, and go next step.

---

4. Using the kubectl drain command with the appropriate flags (`--ignore-daemonsets` and `--delete-emptydir-data`) can help safely evict the application pods from the old Managed Node Group. The kubectl drain command ensures that the pods are gracefully terminated and rescheduled onto other available nodes.
ex: `kubectl drain --ignore-daemonsets --delete-emptydir-data ip-10-0-157-200.ec2.internal`。
![](./docs/step4.jpeg)

---

5. And to remove old `Managed Node Group`, you can remove or comment out the code of managed node group from your CDK code, and then cdk deploy.
![](./docs/step5.png)

---

6. To upgrade the EKS control plane version by modifying the eks.Cluster.version to eks.KubernetesVersion.V1_24 in your CDK code, and then cdk deploy.(The control plane upgrade process typically takes around 10 minutes or longer.)
```ts
const cluster = new eks.Cluster(this, 'Cluster', {
      ...
      version: eks.KubernetesVersion.V1_23, // -> eks.KubernetesVersion.V1_24
      ...
    });
```
![](./docs/step6.png)

---

7. After upgrading the EKS control plane to `v1.24`, you can proceed with upgrading the Data Plane to `v1.24` as well. The steps are similar to the previous upgrade process, with a few modifications.

In step 1, you don't need to specify a Launch Template just to hack the bootstrap.sh because when the cluster is at version v1.24, the newly created Managed Node Group will default to using `containerd` as the Container Network Interface (CRI).
```ts
cluster.addNodegroupCapacity('1-24MNGContainerd', {
      instanceTypes: [new ec2.InstanceType('t3.medium')],
      minSize: 1,
      maxSize: 2,
    //   taints: [{
    //     effect: eks.TaintEffect.NO_SCHEDULE,
    //     value: 'true',
    //     key: 'taints',
    //   }],
    });
```

- 7-1. Create new managed node group.
![](./docs/step7-1.jpeg)

- 7-2. After remove old managed node group.
![](./docs/step7-2.jpeg)


## ✅ Done! 🚀 🚀 🚀 We did it !!! 🚀 🚀 🚀

---

FAQ:

Q: Does it work with other k8s version e.g. 1.25 to 1.26 or 1.26 to 1.27?

We don't know. The solution provided might not fit all k8s versions but it's a general approach for general k8s upgrade. Please let me know if it works for you with other k8s versions. But risks on your own and always back up your data and perform your upgrade in non-production environments.It is recommended to review the [version documentation](https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html#kubernetes-1.23) before starting the upgrade process.

Q: What if my application is stateful? How to minimize the downtime?

There is no silver bullet for that but the general practice is read the EKS documentation, backup your data, test in non-prod environment, validate your application compatibility , plan your downtime for minimal disruption as well as your roll back plan.

Q: This example uses Typescript code for the CDK as a reference. What if I use a different programming language to write CDK code?

Although this demo project is expressed using Typescript, I believe that the upgrade logic should be similar. I believe that the differences in CDK code across other programming languages should be minimal when following the same upgrade logic.

---
### Ref: 
1. https://aws.github.io/aws-eks-best-practices/upgrades/
2. https://docs.aws.amazon.com/zh_tw/eks/latest/userguide/kubernetes-versions.html#kubernetes-1.24
3. https://docs.aws.amazon.com/zh_tw/eks/latest/userguide/kubernetes-versions.html#kubernetes-1.23
4. https://kubernetes.io/blog/2020/12/02/dont-panic-kubernetes-and-docker/
5. https://kubernetes.io/blog/2022/03/31/ready-for-dockershim-removal/
6. https://kubernetes.io/docs/setup/production-environment/container-runtimes/
7. https://github.com/awslabs/amazon-eks-ami/blob/91c6002ff1b3b11e59941aad7417dc91dcf665ef/files/bootstrap.sh#L199
