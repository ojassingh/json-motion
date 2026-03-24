# render-api Specification

## Purpose
TBD - created by archiving change add-deterministic-video-engine. Update Purpose after archive.
## Requirements
### Requirement: The render API validates requests before starting a render job
The system SHALL expose a `POST /api/render` endpoint that validates the incoming JSON body against the video description schema before initializing the renderer or spawning `ffmpeg`.

#### Scenario: Invalid requests fail before rendering starts
- **WHEN** a client submits a render request that is missing required scene timing fields
- **THEN** the API returns a validation error response and does not create an output file or encoder process

### Requirement: The render API returns a retrievable MP4 URL on success
After a valid request is fully rendered, the system SHALL write a single MP4 file to a server-accessible local output path and return a success response that includes a stable job id and a URL for the generated file.

#### Scenario: Successful renders return job metadata
- **WHEN** a client submits a valid render request and the renderer and encoder both succeed
- **THEN** the API returns a success response containing the job id and a URL that resolves to the generated MP4 file

### Requirement: The encoder streams raw RGBA frames into the system ffmpeg binary
The render service SHALL spawn the system `ffmpeg` binary, stream raw RGBA frame buffers to its standard input using the request width, height, and fps, and fail the render if the encoder exits with a non-zero status.

#### Scenario: Encoder success produces a completed MP4
- **WHEN** the render service streams all frames for a valid request and `ffmpeg` exits successfully
- **THEN** the output MP4 is finalized and the API reports the render as complete

### Requirement: Runtime render failures return actionable error responses
The API SHALL return a non-success response when asset loading, frame rendering, or encoding fails, and the response SHALL include a machine-readable error code and descriptive message.

#### Scenario: Missing image assets surface a render error
- **WHEN** a valid render request references an image asset that cannot be loaded during rendering
- **THEN** the API returns a failure response that identifies the render error instead of returning a success URL

