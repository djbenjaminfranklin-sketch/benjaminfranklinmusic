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

function isExternalDevice(device: MediaDeviceInfo): boolean {
  const label = device.label.toLowerCase();
  if (label.includes("built-in") || label.includes("internal")) return false;
  return EXTERNAL_KEYWORDS.some((kw) => label.includes(kw)) ||
    (device.deviceId !== "default" && device.deviceId !== "communications" && !label.includes("built-in"));
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
      // Need a temporary stream to get labeled devices (permission required)
      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        tempStream.getTracks().forEach((t) => t.stop());
      } catch {
        // Permission denied — can't enumerate with labels
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((d) => d.kind === "audioinput");

      if (!mountedRef.current) return;
      setAvailableDevices(audioInputs);

      // Find external device (mixer/interface)
      const external = audioInputs.find(isExternalDevice);
      if (external) {
        setExternalDeviceId(external.deviceId);
        // Auto-switch to USB+Micro when external detected
        setAudioSource("both");
        setAudioSourceName(getDeviceDisplayName(external.label) + " + Micro");
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

    const handleChange = () => detectDevices();
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
