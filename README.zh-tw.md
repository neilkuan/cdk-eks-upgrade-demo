### What is [EKS](./AMAZON_EKS.md)?
# EKS 1.23 supported by Amazon EKS until October 11, 2023.
## This is sample repo supported by Amazon EKS until October 11, 2023. ([README.EN.md](./README.md))
> 此專案用來示範，當 EKS 1.23 叢集，升到 EKS 1.24 時，可以試試看的方式。
> 🚨 免責聲明：該範例只用來示範分享經驗，沒有受到任何 Amazon or Kubernetes Community 的背書，請勿視為官方的手冊，所有損失不負任何擔保責任。🚨 


> 前提提要： [Kubernetes is deprecating Docker as a container runtime after v1.20](https://kubernetes.io/blog/2020/12/02/dont-panic-kubernetes-and-docker/).
> [Is Your Cluster Ready for v1.24?](https://kubernetes.io/blog/2022/03/31/ready-for-dockershim-removal/)
> [Container Runtimes](https://kubernetes.io/docs/setup/production-environment/container-runtimes/)

---

## 升級 Managed Node Group 的邏輯（我的邏輯）
- 因此當 v1.23 Cluster 要升級成，v1.24 之前，會建議先把當前還在使用的 docker-shim 作為 CRI 的

1. 創建另一組 `v1.23` 新的 `Managed Node Group` 將會使用 containerd 作為 CRI，並給予 [taint](https://kubernetes.io/zh-cn/docs/concepts/scheduling-eviction/taint-and-toleration/)，這邊會在 [CDK 內宣告](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_eks-readme.html#managed-node-groups)， (cdk deploy)。
    > 如果是使用 amazon-eks-ami 作為 managed node group 的 ami，在 [bootstrap.sh](https://github.com/awslabs/amazon-eks-ami/blob/91c6002ff1b3b11e59941aad7417dc91dcf665ef/files/bootstrap.sh#L196) 中有定義， `"$KUBELET_VERSION" gteq "1.24.0"`，the way to hack bootstrap.sh in amazon-eks-ami.
    ![](./docs//hack-bootstrap-shell.png)

![](./docs/step1.png)

---

2. 測試部署自己的 Applications，到新的 `Managed Node Group`上，在部署時可以宣告 [tolerations](https://kubernetes.io/docs/concepts/scheduling-eviction/taint-and-toleration/)。

---

3. 移除掉新的 `Managed Node Group` 的 `taint`(透過移除 CDK 內先告的 taint 部分 code cdk deploy )。
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

- 3-1. 追求服務的高可用性，建議先把 stateless 的 Application 擴展到每個 node 都有該 Application，在進行下面的步驟。

---

4. 透過 [`kubectl drain --ignore-daemonsets --delete-emptydir-data $NODE_NAME`]()，將舊的 `Managed Node Group` 的 Nodes 一一進行 `kubectl drain`，使 Application 不要運行在 舊的 `Managed Node Group`中。
ex: `kubectl drain --ignore-daemonsets --delete-emptydir-data ip-10-0-157-200.ec2.internal`。 
![](./docs/step4.jpeg)

---

5. 移除掉舊的 `Managed Node Group`，從 CDK code 裡面拿掉或者註解掉，cdk deploy。
![](./docs/step5.png)

---

6. 接著要進行 EKS Control plane 的升級，修改 eks.Cluster.version 成 `eks.KubernetesVersion.V1_24`， cdk deploy。(大概會跑至少 10 分鐘)。
```ts
const cluster = new eks.Cluster(this, 'Cluster', {
      ...
      version: eks.KubernetesVersion.V1_23, // -> eks.KubernetesVersion.V1_24
      ...
    });
```
![](./docs/step6.png)

---

7. Cluster 升級到 `v1.24` 後，再來升級 Data Plane 到 `v1.24`，基本上重複 step 1 ~ step 5.
但 step 1 創建新的 Managed Node Group 時，不需要給予，Launch Template ，因為當 Cluster 為 v1.24 時，所創建的 Managed Node Group 的 CRI 將預設使用 `containerd`。
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

- 7-1. new managed node group.
![](./docs/step7-1.jpeg)

- 7-2. after remove old managed node group.
![](./docs/step7-2.jpeg)


## ✅ Done! 🚀 🚀 🚀 We did it !!! 🚀 🚀 🚀

---

問與答:

Q: 它是否適用於其他 Kubernetes 版本，例如 1.25 到 1.26 或 1.26 到 1.27？

我們不確定。所提供的解決方案可能不適用於所有 Kubernetes 版本，但這是一種一般性的升級方法。如果您在其他 Kubernetes 版本上使用此方法，請告訴我們它是否適用。請記住自行承擔風險，並始終在非生產環境中備份數據並執行升級，建議開始升級前要先看過[版本文件](https://docs.aws.amazon.com/zh_tw/eks/latest/userguide/kubernetes-versions.html#kubernetes-1.23)。

Q: 如果我的應用程序是有狀態的，如何最小化停機時間？

對於這個問題沒有萬全之策，但一般的做法是閱讀 EKS 文檔、備份數據、在非生產環境中進行測試，驗證應用程序的兼容性，計劃停機時間以盡量減少中斷，同時制定回滾計劃。

Q: 此範例是使用 Typescript 的 CDK 代碼作為範例，那如果我用其他語言寫 CDK 怎麼辦？

對於這個問題，雖然此 demo project 是使用 Typescript 來作為表達，但是我相信依照壹樣的升級邏輯，我相信與其他語言的 CDK 代碼應該差異不大。

---
### 參考資料: 
1. https://aws.github.io/aws-eks-best-practices/upgrades/
2. https://docs.aws.amazon.com/zh_tw/eks/latest/userguide/kubernetes-versions.html#kubernetes-1.24
3. https://docs.aws.amazon.com/zh_tw/eks/latest/userguide/kubernetes-versions.html#kubernetes-1.23
4. https://kubernetes.io/blog/2020/12/02/dont-panic-kubernetes-and-docker/
5. https://kubernetes.io/blog/2022/03/31/ready-for-dockershim-removal/
6. https://kubernetes.io/docs/setup/production-environment/container-runtimes/
7. https://github.com/awslabs/amazon-eks-ami/blob/91c6002ff1b3b11e59941aad7417dc91dcf665ef/files/bootstrap.sh#L199
