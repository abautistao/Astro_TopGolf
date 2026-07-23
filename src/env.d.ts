/// <reference path="../.astro/types.d.ts" />

type RuntimeEnv = {
  [key: string]: string | undefined;
};

declare namespace App {
  interface Locals {
    runtime?: {
      env: RuntimeEnv;
    };
  }
}
