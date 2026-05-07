import tencentcloud from "tencentcloud-sdk-nodejs";

import {
  TENCENT_ASR_ENGINE_MODEL_TYPE,
  TENCENT_ASR_REGION,
  TENCENT_ASR_SECRET_ID,
  TENCENT_ASR_SECRET_KEY
} from "../config.js";

export interface VoiceTranscribeInput {
  fileName: string;
  mimeType: string;
  base64: string;
}

export interface VoiceTranscriber {
  isEnabled(): boolean;
  transcribe(input: VoiceTranscribeInput): Promise<string>;
}

const AsrClient = tencentcloud.asr.v20190614.Client;

function resolveVoiceFormat(fileName: string, mimeType: string): string {
  const lowerFile = String(fileName || "").toLowerCase();
  if (lowerFile.endsWith(".mp3")) return "mp3";
  if (lowerFile.endsWith(".m4a")) return "m4a";
  if (lowerFile.endsWith(".aac")) return "aac";
  if (lowerFile.endsWith(".wav")) return "wav";
  if (lowerFile.endsWith(".amr")) return "amr";

  const lowerMime = String(mimeType || "").toLowerCase();
  if (lowerMime.includes("mpeg") || lowerMime.includes("mp3")) return "mp3";
  if (lowerMime.includes("m4a")) return "m4a";
  if (lowerMime.includes("aac")) return "aac";
  if (lowerMime.includes("wav")) return "wav";
  if (lowerMime.includes("amr")) return "amr";

  return "mp3";
}

export class TencentAsrService implements VoiceTranscriber {
  private client: InstanceType<typeof AsrClient> | null = null;

  constructor() {
    if (!TENCENT_ASR_SECRET_ID || !TENCENT_ASR_SECRET_KEY) {
      return;
    }

    this.client = new AsrClient({
      credential: {
        secretId: TENCENT_ASR_SECRET_ID,
        secretKey: TENCENT_ASR_SECRET_KEY
      },
      region: TENCENT_ASR_REGION,
      profile: {
        httpProfile: {
          endpoint: "asr.tencentcloudapi.com"
        }
      }
    });
  }

  isEnabled(): boolean {
    return Boolean(this.client);
  }

  async transcribe(input: VoiceTranscribeInput): Promise<string> {
    if (!this.client) {
      throw new Error("语音识别服务未配置");
    }

    const audioBuffer = Buffer.from(String(input.base64 || ""), "base64");
    if (!audioBuffer.length) {
      throw new Error("语音数据为空");
    }

    const response = await this.client.SentenceRecognition({
      EngSerViceType: TENCENT_ASR_ENGINE_MODEL_TYPE,
      SourceType: 1,
      VoiceFormat: resolveVoiceFormat(input.fileName, input.mimeType),
      Data: input.base64,
      DataLen: audioBuffer.length,
      FilterDirty: 2,
      FilterModal: 2,
      FilterPunc: 2,
      ConvertNumMode: 1,
      WordInfo: 0
    });

    return String(response.Result || "").trim();
  }
}
