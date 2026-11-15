// AudioWorklet that forwards raw microphone samples to the main thread.
// Used by the speech check to run the on-device speech model.
class PcmRecorder extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor("pcm-recorder", PcmRecorder);
