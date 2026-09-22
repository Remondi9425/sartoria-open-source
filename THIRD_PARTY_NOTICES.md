# Third-party code and assets

The root MIT licence covers original SartorIA code and documentation. It does not
replace the licences of dependencies, datasets, pretrained weights or body models.
Lockfiles record the dependencies used for this source release.

| Component | Relationship | Upstream terms/source |
| --- | --- | --- |
| NLF | Optional inference code and pretrained model | [Upstream repository](https://github.com/isarandi/nlf): code MIT; released models for noncommercial research |
| SMPL | Body representation used by the NLF adapter | [Official model site](https://smpl.is.tue.mpg.de/): obtain and review the applicable model terms separately |
| PyTorch / torchvision | Optional GPU runtime | [PyTorch](https://github.com/pytorch/pytorch/blob/main/LICENSE), [torchvision](https://github.com/pytorch/vision/blob/main/LICENSE) |
| NumPy / OpenCV | Geometry and video decoding | [NumPy](https://github.com/numpy/numpy/blob/main/LICENSE.txt), [OpenCV](https://github.com/opencv/opencv/blob/4.x/LICENSE) |
| FastAPI / Next.js / React / Tailwind CSS | API and web application | Licences shipped in each installed distribution |
| Modal | Optional hosting platform and SDK | SDK licence and service terms apply separately |

Model weights and SMPL files are not included in the public snapshot. The optional
Modal build downloads the NLF release declared in `modal_app.py` and verifies its
recorded size and SHA-256. Choose that path only after reviewing the model terms.
The GPU runtime remains pinned to its existing tested model integration; it has
not been upgraded or validated on a GPU as part of source preparation.

Upstream template icons, where retained, originate from the Next.js starter.
Private recordings, presentations and research results are outside this release.
A permissive licence on application code is not a claim that the complete model
pipeline can be used commercially.
