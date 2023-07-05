from flask import Flask, request
from g4f import ChatCompletion, Provider, Model
# from transformers import VisionEncoderDecoderModel, ViTImageProcessor, AutoTokenizer
# import torch, os, string, random, requests
# from PIL import Image

# model = VisionEncoderDecoderModel.from_pretrained("nlpconnect/vit-gpt2-image-captioning")
# feature_extractor = ViTImageProcessor.from_pretrained("nlpconnect/vit-gpt2-image-captioning")
# tokenizer = AutoTokenizer.from_pretrained("nlpconnect/vit-gpt2-image-captioning")

# device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
# model.to(device)

# max_length = 16
# num_beams = 4
# gen_kwargs = {"max_length": max_length, "num_beams": num_beams}

# def predict_step(image_paths):
#     images = []
#     for image_path in image_paths:
#         i_image = Image.open(image_path)
#         if i_image.mode != "RGB":
#             i_image = i_image.convert(mode="RGB")
#         images.append(i_image)

#     pixel_values = feature_extractor(images=images, return_tensors="pt").pixel_values
#     pixel_values = pixel_values.to(device)

#     output_ids = model.generate(pixel_values, **gen_kwargs)

#     preds = tokenizer.batch_decode(output_ids, skip_special_tokens=True)
#     preds = [pred.strip() for pred in preds]
#     return preds

app = Flask(__name__)

@app.route("/", methods=["POST"])
def post():
    if request.method != "POST": return
    req = request.get_json()
    res = ChatCompletion.create(
        model=Model.gpt_35_turbo,
        provider=Provider.DeepAi,
        messages=req["messages"]
    )
    return res
app.run(host="0.0.0.0", port=80)
# @app.route("/predict", methods=["POST"])
# def predict():
#     if request.method != "POST": return
#     url = request.data.decode()
#     img_data = requests.get(url)
    
#     if img_data.status_code != 200: return "Image error!"
#     file_name = ''.join(random.SystemRandom().choice(string.ascii_uppercase + string.digits) for _ in range(20)) + ".png"
#     with open(file_name, "wb") as handle:
#         response = requests.get(url, stream=True)
#         if not response.ok: return "Image error!"
#         for block in response.iter_content(1024):
#             if not block: break
#             handle.write(block)
#     result = predict_step([file_name])[0]
#     print(result)
#     os.unlink(file_name)
#     return result