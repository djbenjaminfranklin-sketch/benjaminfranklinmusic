"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export type AudioSourceType = "internal" | "external" | "both";

export interface AudioDeviceState {
  audioSource: AudioSourceType;
  audioSourceName: string;
  externalDeviceId: string | null;
  internalDeviceId: string | null;
  availableDevices: MediaDeviceInfo[];
  isDetecting: boolean;
  setAudioSource: (source: AudioSourceType) => void;
}

// Known mixer/interface brand keywords for auto-detection
const EXTERNAL_KEYWORDS = [
  "usb", "interface", "mixer", "line in", "audio in", "external",
  "scarlett", "focusrite", "behringer", "native instruments",
  "pioneer", "denon", "allen", "mackie", "presonus", "steinberg",
  "motu", "apogee", "universal audio", "roland", "yamaha",
  "soundcraft", "irig", "djm", "ddj", "cdj", "xone", "traktor",
];

// Labels that indicate a built-in device (not an external mixer)
const BUILTIN_KEYWORDS = [
  "built-in", "internal", "iphone", "ipad",
  "front camera", "back camera", "rear camera",
];

function isExternalDevice(device: MediaDeviceInfo): boolean {
  const label = device.label.toLowerCase();
  // Filter out built-in devices
  if (BUILTIN_KEYWORDS.some((kw) => label.includes(kw))) return false;
  // Filter out default/generic entries
  if (!label || label === "default" || label === "communications") return false;
  // Match known external keywords
  if (EXTERNAL_KEYWORDS.some((kw) => label.includes(kw))) return true;
  // On iOS, the built-in mic label is "iPhone Microphone" (filtered above).
  // Any remaining non-default device with a real label is likely external.
  return device.deviceId !== "default" && device.deviceId !== "communications";
}

function getDeviceDisplayName(label: string): string {
  const lower = label.toLowerCase();
  if (lower.includes("pioneer") || lower.includes("djm") || lower.includes("ddj")) {
    const match = lower.match(/(djm[- ]?[a-z0-9]+|ddj[- ]?[a-z0-9]+|cdj[- ]?[a-z0-9]+)/i);
    return match ? `Pioneer ${match[1].toUpperCase().replace("-", " ")}` : "Pioneer DJ";
  }
  if (lower.includes("allen") || lower.includes("xone")) return "Allen & Heath";
  if (lower.includes("denon")) return "Denon DJ";
  if (lower.includes("native instruments") || lower.includes("traktor")) return "Native Instruments";
  return label || "Source externe";
}

export function useAudioDevices(): AudioDeviceState {
  const [audioSource, setAudioSource] = useState<AudioSourceType>("internal");
  const [audioSourceName, setAudioSourceName] = useState("Microphone");
  const [externalDeviceId, setExternalDeviceId] = useState<string | null>(null);
  const [internalDeviceId, setInternalDeviceId] = useState<string | null>(null);
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const mountedRef = useRef(true);

  const detectDevices = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) return;

    setIsDetecting(true);
    try {
      // Try to enumerate first — if permissions were already granted (e.g. by broadcast),
      // we'll get labels without needing a temporary stream
      let devices = await navigator.mediaDevices.enumerateDevices();
      const hasLabels = devices.some((d) => d.kind === "audioinput" && d.label);

      // Only request getUserMedia if we don't have labels yet and no stream is active
      if (!hasLabels) {
        try {
          const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          tempStream.getTracks().forEach((t) => t.stop());
          devices = await navigator.mediaDevices.enumerateDevices();
        } catch {
          // Permission denied — continue with unlabeled devices
        }
      }
      const audioInputs = devices.filter((d) => d.kind === "audioinput");

      // Log all audio inputs for debugging (especially on iOS)
      console.log("[AudioDevices] Detected inputs:", audioInputs.map((d) => ({
        label: d.label, id: d.deviceId.slice(0, 8), group: d.groupId.slice(0, 8),
      })));

      if (!mountedRef.current) return;
      setAvailableDevices(audioInputs);

      // Find external device (mixer/interface)
      const external = audioInputs.find(isExternalDevice);
      if (external) {
        console.log("[AudioDevices] External device found:", external.label, "id:", external.deviceId.slice(0, 8));
        setExternalDeviceId(external.deviceId);
        // Auto-switch to USB+Micro when external detected
        setAudioSource("both");
        setAudioSourceName(getDeviceDisplayName(external.label) + " + Micro");
      } else {
        console.log("[AudioDevices] No external device detected");
      }

      // Find internal mic
      const internal = audioInputs.find((d) => {
        const label = d.label.toLowerCase();
        return label.includes("built-in") || label.includes("internal") || d.deviceId === "default";
      }) || audioInputs[0];

      if (internal) {
        setInternalDeviceId(internal.deviceId);
        if (!external) {
          setAudioSourceName(internal.label || "Microphone");
        }
      }
    } catch (err) {
      console.error("[AudioDevices] Detection error:", err);
    } finally {
      if (mountedRef.current) setIsDetecting(false);
    }
  }, []);

  // Detect on mount
  useEffect(() => {
    mountedRef.current = true;
    detectDevices();
    return () => { mountedRef.current = false; };
  }, [detectDevices]);

  // Listen for device changes (plug/unplug)
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) return;

    const handleChange = () => {
      console.log("[AudioDevices] Device change detected — re-scanning...");
      detectDevices();
    };
    navigator.mediaDevices.addEventListener("devicechange", handleChange);
    return () => navigator.mediaDevices.removeEventListener("devicechange", handleChange);
  }, [detectDevices]);

  // Update name when source changes manually
  const handleSetSource = useCallback((source: AudioSourceType) => {
    setAudioSource(source);
    const external = availableDevices.find(isExternalDevice);
    const internal = availableDevices.find((d) => {
      const label = d.label.toLowerCase();
      return label.includes("built-in") || d.deviceId === "default";
    }) || availableDevices[0];

    if (source === "internal") {
      setAudioSourceName(internal?.label || "Micro");
    } else if (source === "external") {
      setAudioSourceName(external ? getDeviceDisplayName(external.label) : "USB");
    } else {
      const extName = external ? getDeviceDisplayName(external.label) : "USB";
      setAudioSourceName(extName + " + Micro");
    }
  }, [availableDevices]);

  return {
    audioSource,
    audioSourceName,
    externalDeviceId,
    internalDeviceId,
    availableDevices,
    isDetecting,
    setAudioSource: handleSetSource,
  };
}
