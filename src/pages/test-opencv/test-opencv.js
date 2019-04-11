// TODO
const stream = Navigator.mediaDevices.getUserMedia({
  video: { facingMode: 'user', frameRate: 10, width: 640, height: 480 }
});
let video = document.getElementById('videoInput');
video.src = stream;
let cap = new cv.VideoCapture(video);

let frame = new cv.Mat(video.height, video.width, cv.CV_8UC4);
let fgmask = new cv.Mat(video.height, video.width, cv.CV_8UC1);
let fgbg = new cv.BackgroundSubtractorMOG2(500, 16, true);

const FPS = 30;
function processVideo() {
  try {
    if (!streaming) {
      // clean and stop.
      frame.delete(); fgmask.delete(); fgbg.delete();
      return;
    }
    let begin = Date.now();
    // start processing.
    cap.read(frame);
    fgbg.apply(frame, fgmask);
    cv.imshow('canvasOutput', fgmask);
    // schedule the next one.
    let delay = 1000/FPS - (Date.now() - begin);
    setTimeout(processVideo, delay);
  } catch (err) {
    console.log(err);
  }
};

// schedule the first one.
setTimeout(processVideo, 0);
