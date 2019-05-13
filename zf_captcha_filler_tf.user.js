// ==UserScript==
// @name         基于tf的zf验证码填充脚本
// @version      1.0
// @author       1248289414
// @namespace    https://github.com/1248289414
// @description  基于tensorflow.js的自动填充教务处验证码的脚本
// @match        https://jwc.scnu.edu.cn/
// @match        https://jwc.scnu.edu.cn/default2.aspx
// @run-at       document-end
// @require      https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@1.1.2/dist/tf.min.js
// @grant        GM_registerMenuCommand
// ==/UserScript==

// 结果跟实际字母的对照表
const Alphabet = "012345678abcdefghijklmnpqrstuvwxy";
const DBname = "jwc-captcha-model-1";

class imgData {

    async load(img) {
        // 整个图片的像素个数
        let IMAGE_SIZE = img.width * img.height;

        // 获取canvas用于绘图
        let canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;

        // 绘图
        let ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        // 将提取像素信息
        let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // 单独提取red通道值，建立灰度图
        let grayImageData = new Float32Array(IMAGE_SIZE);
        for (let i = 0; i < IMAGE_SIZE; i++) {
            grayImageData[i] = imageData.data[i * 4] / 255.0;
        }

        // 在cut_x的切割点处将，切割图像为4个18*23的小块
        let cut_x = [0, 13, 27, 41];
        let block_width = 18;
        let block_height = 23;
        let block_size = block_width * block_height;
        this.data = new Float32Array(block_size * 4);
        for (let i = 0; i < 4; i++) {
            let index = cut_x[i];

            for (let j = 0; j < block_height; j++) {
                let row = grayImageData.slice(j * img.width + index, j * img.width + index + block_width);
                this.data.set(row, i * block_size + j * block_width)
            }
        }

    }

    get() {
        return tf.tensor4d(this.data, [4, 23, 18, 1]);
    }
}

async function run() {
    // 获取验证码图片，判断是否加载成功
    let img = document.getElementById("icode");
    if (img.height != 27 || img.width != 72) {
        return
    }

    let data = new imgData();
    await data.load(img);

    await indexedDB.open(DBname);
    // 打开模型，失败则退出
    let model;
    try {
        model = await tf.loadLayersModel("indexeddb://" + DBname);
    } catch (e) {
        console.log("模型加载失败，你可能没有导入模型");
        return
    }

    // 预测验证码的值
    let score = await model.predict(data.get()).argMax([-1]);

    // 将结果转换为字符串
    let arr = Array.from(score.dataSync());
    let captcha = '';
    for (let i = 0; i < 4; i++) {
        captcha = captcha + Alphabet[arr[i]];
    }

    // 填入验证码
    let txtSecretCode = document.getElementById("txtSecretCode");
    txtSecretCode.value = captcha;
}

// 上传模型并保存
async function get_and_storage_model() {

    let json_upload = document.createElement("input");
    json_upload.id = "json_upload";
    json_upload.type = "file";

    let weights_upload = document.createElement("input");
    weights_upload.id = "weights_upload";
    weights_upload.type = "file";

    json_upload.onchange = async function () {
        confirm("传入权重文件，后缀名为.bin")
        weights_upload.click()
    }

    weights_upload.onchange = async function () {
        if (json_upload.files.length <= 0 && weights_upload.files.length <= 0) {
            confirm("你没有选择文件");
            return
        }
        await indexedDB.open(DBname);


        let model = await tf.loadLayersModel(tf.io.browserFiles([json_upload.files[0], weights_upload.files[0]]));
        await model.save("indexeddb://" + DBname);

        run();
    }

    confirm("传入模型文件，后缀名为.json")
    json_upload.click()
}

(async function () {
    'use strict';

    GM_registerMenuCommand("导入模型", get_and_storage_model);

    // 运行预测
    run();

    let img = document.getElementById("icode");
    img.onload = run;

})();