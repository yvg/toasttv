-- ToastTV Logo Overlay Script
-- Uses MPV's overlay-add command for image display

local utils = require("mp.utils")

local overlay_id = 1
local logo_visible = false
local current_path = nil
local current_x = nil
local current_y = nil

-- Convert PNG to raw BGRA using ffmpeg, then add as overlay
local function show_overlay(path, x, y)
    if not path or path == "" then return end
    
    -- Get image dimensions first
    local result = utils.subprocess({
        args = {"ffprobe", "-v", "error", "-select_streams", "v:0", 
                "-show_entries", "stream=width,height", "-of", "csv=p=0", path},
        capture_stdout = true,
    })
    
    if result.status ~= 0 or not result.stdout then
        mp.msg.error("Failed to get image dimensions")
        return
    end
    
    local width, height = result.stdout:match("(%d+),(%d+)")
    width = tonumber(width)
    height = tonumber(height)
    
    if not width or not height then
        mp.msg.error("Invalid dimensions: " .. (result.stdout or "nil"))
        return
    end
    
    -- Convert to raw BGRA (no opacity modification - keep original alpha)
    local raw_path = "/tmp/logo-overlay.raw"
    local conv = utils.subprocess({
        args = {"ffmpeg", "-y", "-v", "error", "-i", path, 
                "-pix_fmt", "bgra", "-f", "rawvideo", raw_path},
    })
    
    if conv.status ~= 0 then
        mp.msg.error("Failed to convert image to raw BGRA")
        return
    end
    
    -- Calculate position (default to top-right with margin)
    local osd_w, osd_h = mp.get_osd_size()
    if not osd_w or osd_w == 0 then
        osd_w = 1920
        osd_h = 1080
    end
    
    local pos_x = osd_w - width - (x or 10)
    local pos_y = y or 10
    
    -- Add overlay
    mp.commandv("overlay-add", overlay_id, pos_x, pos_y, raw_path, 
                0, "bgra", width, height, width * 4)
    
    logo_visible = true
    current_path = path
    current_x = x
    current_y = y
    mp.msg.info("Logo overlay added at " .. pos_x .. "," .. pos_y)
end

local function hide_overlay()
    if logo_visible then
        mp.commandv("overlay-remove", overlay_id)
        logo_visible = false
        mp.msg.info("Logo overlay removed")
    end
end

-- args: path, align (ignored), margin_x, margin_y, opacity (ignored for now)
mp.register_script_message("show-logo", function(path, align, mx, my, op)
    local margin_x = tonumber(mx) or 10
    local margin_y = tonumber(my) or 10
    show_overlay(path, margin_x, margin_y)
end)

mp.register_script_message("hide-logo", function()
    hide_overlay()
end)

-- Re-apply overlay on file change (MPV clears overlays between files)
mp.register_event("file-loaded", function()
    if current_path then
        mp.msg.info("Re-applying logo after file change")
        -- Small delay to ensure video is ready
        mp.add_timeout(0.1, function()
            show_overlay(current_path, current_x, current_y)
        end)
    end
end)
