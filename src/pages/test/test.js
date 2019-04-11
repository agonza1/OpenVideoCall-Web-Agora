const canvas = document.getElementById('canvas');
const video = document.querySelector('video');

let pc1;
let pc2;
const offerOptions = {
  offerToReceiveAudio: 1,
  offerToReceiveVideo: 1
};

let startTime;

function onLoad() {
  const MODEL_URL =
    'src/utils/tensorflow/deeplabv3_mnv2_pascal_train_aug_web_model/tensorflowjs_model.pb';
  const WEIGHTS_URL =
    'src/utils/tensorflow/deeplabv3_mnv2_pascal_train_aug_web_model/weights_manifest.json';
  // Model's input and output have width and height of 513.
  const TENSOR_EDGE = 513;
  let stopImageProcessing = false;
  // Const model = return new Promise(tf.loadFrozenModel(MODEL_URL, WEIGHTS_URL));
  const model = new Promise(function(resolve) {
    resolve(tf.loadFrozenModel(MODEL_URL, WEIGHTS_URL));
  });
  return navigator.mediaDevices
    .getUserMedia({
      audio: false,
      video: { facingMode: 'user', frameRate: 5, width: 640, height: 480 }
    })
    .then(function(stream) {
      return model.then(function(model) {
        const video = document.createElement('video');
        video.autoplay = true;
        video.width = video.height = TENSOR_EDGE;
        const ctx = canvas.getContext('2d');
        const videoCopy = ctx.canvas.cloneNode(false).getContext('2d');
        const maskContext = document.createElement('canvas').getContext('2d');
        maskContext.canvas.width = maskContext.canvas.height = TENSOR_EDGE;
        const img = maskContext.createImageData(TENSOR_EDGE, TENSOR_EDGE);
        let imgd = img.data;
        new Uint32Array(imgd.buffer).fill(0x00ffffff);

        const render = () => {
          // VideoCopy is the canvas name where we are placing the video
          videoCopy.drawImage(video, 0, 0, ctx.canvas.width, ctx.canvas.height);
          const out = tf.tidy(() => {
            return model.execute({ ImageTensor: tf.fromPixels(video).expandDims(0) });
          });
          // Data will be multidimensional array of numbers that has the detected object shape and data type.
          const data = out.dataSync();
          // Then we will for loop all the pixels and make the mask transparent or opaque based on if it is a segmented object or not(background)
          for (let i = 0; i < data.length; i++) {
            imgd[i * 4 + 3] = data[i] == 15 ? 0 : 255;
          }
          ctx.drawImage(videoCopy.canvas, 0, 0);
          maskContext.putImageData(img, 0, 0);
          // Cover background, put over video a mask: maskContext
          if (document.getElementById('show-background-toggle').checked)
            ctx.drawImage(maskContext.canvas, 0, 0, ctx.canvas.width, ctx.canvas.height);

          if (document.getElementById('stop-image-processing-toggle').checked) {
            stopImageProcessing = true;
          } else {
            stopImageProcessing = false;
          }

          if (!stopImageProcessing) window.requestAnimationFrame(render);
        };
        // Once video is ready to play, render
        video.oncanplay = render;
        // Pass stream to video src
        video.srcObject = stream;

        return new Promise(function(resolve) {
          resolve();
        });
      });
    });
}

function call(stream) {
  console.log('Starting call');
  startTime = window.performance.now();
  const videoTracks = stream.getVideoTracks();
  const audioTracks = stream.getAudioTracks();
  if (videoTracks.length > 0) {
    console.log(`Using video device: ${videoTracks[0].label}`);
  }
  if (audioTracks.length > 0) {
    console.log(`Using audio device: ${audioTracks[0].label}`);
  }
  const servers = null;
  pc1 = new RTCPeerConnection(servers);
  console.log('Created local peer connection object pc1');
  pc1.onicecandidate = e => onIceCandidate(pc1, e);
  pc2 = new RTCPeerConnection(servers);
  console.log('Created remote peer connection object pc2');
  pc2.onicecandidate = e => onIceCandidate(pc2, e);
  pc1.oniceconnectionstatechange = e => onIceStateChange(pc1, e);
  pc2.oniceconnectionstatechange = e => onIceStateChange(pc2, e);
  pc2.ontrack = gotRemoteStream;

  stream.getTracks().forEach(track => {
    pc1.addTrack(track, stream);
  });
  console.log('Added local stream to pc1');

  console.log('pc1 createOffer start');
  pc1.createOffer(onCreateOfferSuccess, onCreateSessionDescriptionError, offerOptions);
}

function onCreateSessionDescriptionError(error) {
  console.log(`Failed to create session description: ${error.toString()}`);
}

function onCreateOfferSuccess(desc) {
  console.log(`Offer from pc1\n${desc.sdp}`);
  console.log('pc1 setLocalDescription start');
  pc1.setLocalDescription(
    desc,
    () => onSetLocalSuccess(pc1),
    onSetSessionDescriptionError
  );
  console.log('pc2 setRemoteDescription start');
  pc2.setRemoteDescription(
    desc,
    () => onSetRemoteSuccess(pc2),
    onSetSessionDescriptionError
  );
  console.log('pc2 createAnswer start');
  // Since the 'remote' side has no media stream we need
  // to pass in the right constraints in order for it to
  // accept the incoming offer of audio and video.
  pc2.createAnswer(onCreateAnswerSuccess, onCreateSessionDescriptionError);
}

function onSetLocalSuccess(pc) {
  console.log(`${getName(pc)} setLocalDescription complete`);
}

function onSetRemoteSuccess(pc) {
  console.log(`${getName(pc)} setRemoteDescription complete`);
}

function onSetSessionDescriptionError(error) {
  console.log(`Failed to set session description: ${error.toString()}`);
}

function gotRemoteStream(e) {
  if (video.srcObject !== e.streams[0]) {
    video.srcObject = e.streams[0];
    console.log('pc2 received remote stream');
  }
}

function onCreateAnswerSuccess(desc) {
  console.log(`Answer from pc2:\n${desc.sdp}`);
  console.log('pc2 setLocalDescription start');
  pc2.setLocalDescription(
    desc,
    () => onSetLocalSuccess(pc2),
    onSetSessionDescriptionError
  );
  console.log('pc1 setRemoteDescription start');
  pc1.setRemoteDescription(
    desc,
    () => onSetRemoteSuccess(pc1),
    onSetSessionDescriptionError
  );
}

function onIceCandidate(pc, event) {
  getOtherPc(pc)
    .addIceCandidate(event.candidate)
    .then(() => onAddIceCandidateSuccess(pc), err => onAddIceCandidateError(pc, err));
  console.log(
    `${getName(pc)} ICE candidate: ${
      event.candidate ? event.candidate.candidate : '(null)'
    }`
  );
}

function onAddIceCandidateSuccess(pc) {
  console.log(`${getName(pc)} addIceCandidate success`);
}

function onAddIceCandidateError(pc, error) {
  console.log(`${getName(pc)} failed to add ICE Candidate: ${error.toString()}`);
}

function onIceStateChange(pc, event) {
  if (pc) {
    console.log(`${getName(pc)} ICE state: ${pc.iceConnectionState}`);
    console.log('ICE state change event: ', event);
  }
}

function getName(pc) {
  return pc === pc1 ? 'pc1' : 'pc2';
}

function getOtherPc(pc) {
  return pc === pc1 ? pc2 : pc1;
}

// MAIN

onLoad().then(function() {
  const stream = canvas.captureStream();
  console.log('Got stream from canvas', stream);
  call(stream);
});
