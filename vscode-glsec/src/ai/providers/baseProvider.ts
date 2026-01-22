import { AIProvider, AIConfig,GenerateOptions } from "../aiInterface";
import { SvnFile } from "../../vcs/svnService";

export abstract class BaseProvider implements AIProvider {
  abstract readonly name: string;
  protected config?: AIConfig;

  constructor(config?: AIConfig) {
    this.config = config;
  }

  abstract isAvailable(): Promise<boolean>;

  abstract generateCommitMessage(
    diff: string,
    changedFiles: SvnFile[],
    options?: GenerateOptions,
  ): Promise<string>;
}
