// Zendao 禅道接口类型定义
export interface ZendaoResponse {
  title: string;
  products: Record<string, string>;
  productID: string;
  branches: any[];
  modulePath: ZendaoModule[];
  bugModule: ZendaoModule;
  bug: ZendaoBug;
  from: string;
  branchName: string;
  users: Record<string, string>;
  actions: Record<string, ZendaoAction>;
  builds: Record<string, any>;
  preAndNext: ZendaoPreAndNext;
  product: ZendaoProduct;
  pager: any | null;
}

interface ZendaoModule {
  id: string;
  root: string;
  branch: string;
  name: string;
  parent: string;
  path: string;
  grade: string;
  order: string;
  type: string;
  owner: string;
  collector: string;
  short: string;
  deleted: string;
}

interface ZendaoBug {
  id: string;
  project: string;
  product: string;
  branch: string;
  module: string;
  execution: string;
  plan: string;
  story: string;
  storyVersion: string;
  task: string;
  toTask: string;
  toStory: string;
  title: string;
  keywords: string;
  severity: string;
  pri: string;
  type: string;
  os: string;
  browser: string;
  hardware: string;
  found: string;
  steps: string;
  status: string;
  subStatus: string;
  color: string;
  confirmed: string;
  activatedCount: string;
  activatedDate: string;
  mailto: string;
  openedBy: string;
  openedDate: string;
  openedBuild: string;
  assignedTo: string;
  assignedDate: string;
  deadline: string;
  resolvedBy: string;
  resolution: string;
  resolvedBuild: string;
  resolvedDate: string;
  closedBy: string;
  closedDate: string;
  duplicateBug: string;
  linkBug: string;
  case: string;
  caseVersion: string;
  result: string;
  repo: string;
  entry: string;
  lines: string;
  v1: string;
  v2: string;
  repoType: string;
  testtask: string;
  lastEditedBy: string;
  lastEditedDate: string;
  deleted: string;
  executionName: string;
  storyTitle: string | null;
  storyStatus: string | null;
  latestStoryVersion: string | null;
  taskName: string | null;
  planName: string | null;
  toCases: any[];
  files: any[];
}

interface ZendaoActionHistory {
  id: string;
  action: string;
  field: string;
  old: string;
  new: string;
  diff: string;
}

interface ZendaoAction {
  id: string;
  objectType: string;
  objectID: string;
  product: string;
  project: string;
  execution: string;
  actor: string;
  action: string;
  date: string;
  comment: string;
  extra: string;
  read: string;
  history: ZendaoActionHistory[];
}

interface ZendaoPreAndNextBug {
  id: string;
  project: string;
  product: string;
  branch: string;
  module: string;
  execution: string;
  plan: string;
  story: string;
  storyVersion: string;
  task: string;
  toTask: string;
  toStory: string;
  title: string;
  keywords: string;
  severity: string;
  pri: string;
  type: string;
  os: string;
  browser: string;
  hardware: string;
  found: string;
  steps: string;
  status: string;
  subStatus: string;
  color: string;
  confirmed: string;
  activatedCount: string;
  activatedDate: string;
  mailto: string;
  openedBy: string;
  openedDate: string;
  openedBuild: string;
  assignedTo: string;
  assignedDate: string;
  deadline: string;
  resolvedBy: string;
  resolution: string;
  resolvedBuild: string;
  resolvedDate: string;
  closedBy: string;
  closedDate: string;
  duplicateBug: string;
  linkBug: string;
  case: string;
  caseVersion: string;
  result: string;
  repo: string;
  entry: string;
  lines: string;
  v1: string;
  v2: string;
  repoType: string;
  testtask: string;
  lastEditedBy: string;
  lastEditedDate: string;
  deleted: string;
}

interface ZendaoPreAndNext {
  pre: ZendaoPreAndNextBug;
  next: ZendaoPreAndNextBug;
}

interface ZendaoProduct {
  id: string;
  program: string;
  name: string;
  code: string;
  bind: string;
  line: string;
  type: string;
  status: string;
  subStatus: string;
  desc: string;
  PO: string;
  QD: string;
  RD: string;
  acl: string;
  whitelist: string;
  createdBy: string;
  createdDate: string;
  createdVersion: string;
  order: string;
  deleted: string;
  storyConcept: string;
}
