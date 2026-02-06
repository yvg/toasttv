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
    
    -- Check if file exists
    local check = io.open(path, "r")
    if not check then
        mp.msg.warn("File not found: " .. path)
        return
    end
    check:close()
    
    -- Get image dimensions first
    local result = utils.subprocess({
        args = {"/usr/bin/ffprobe", "-v", "error", "-select_streams", "v:0", 
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
        args = {"/usr/bin/ffmpeg", "-y", "-v", "error", "-i", path, 
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

-- Display info text (IP/status) from /tmp/toasttv-info
local function draw_info()
    local f = io.open("/tmp/toasttv-info", "r")
    if not f then return end
    
    local lines = {}
    for line in f:lines() do
        table.insert(lines, line)
    end
    f:close()
    
    if #lines == 0 then return end
    
    local osd_w, osd_h = mp.get_osd_size()
    if not osd_w or osd_w == 0 then
        osd_w = 1920
        osd_h = 1080
    end
    
    -- ASS formatting
    local ass = ""
    ass = ass .. string.format("{\\an7\\pos(%d,%d)\\fs48\\bord2\\3c&H000000&\\c&HFFFFFF&}", 20, osd_h - 100)
    
    for _, line in ipairs(lines) do
        ass = ass .. line .. "\\N"
    end
    
    mp.set_osd_ass(osd_w, osd_h, ass)
end

local function clear_info()
    local osd_w, osd_h = mp.get_osd_size()
    if not osd_w then osd_w = 1920; osd_h = 1080 end
    mp.set_osd_ass(osd_w, osd_h, "")
end

-- Re-apply overlay on file change
mp.register_event("file-loaded", function()
    if current_path then
        mp.msg.info("Re-applying logo after file change")
        mp.add_timeout(0.1, function()
            show_overlay(current_path, current_x, current_y)
            -- Only draw info if we are somehow still idle (unlikely on file load)
            if mp.get_property_bool("idle-active") then
                draw_info()
            else
                clear_info()
            end
        end)
    else
        clear_info()
    end
end)

-- Observe idle property to toggle info text AND default logo
mp.observe_property("idle-active", "bool", function(name, idle)
    if idle then
        -- Draw Info
        draw_info()
        
        -- Draw Default Logo (if not already showing a file logo)
        local default_logo = "/opt/toasttv/data/logo.png"
        local f = io.open(default_logo, "r")
        if f then
            f:close()
            show_overlay(default_logo, 10, 10)
        end
    else
        clear_info()
    end
end)

-- Initial draw (Startup)
mp.add_timeout(1.0, function()
    -- Trigger idle check manually to load initial state
    local is_idle = mp.get_property_bool("idle-active")
    if is_idle then
        draw_info()
        local default_logo = "/opt/toasttv/data/logo.png"
        local f = io.open(default_logo, "r")
        if f then
             f:close()
             show_overlay(default_logo, 10, 10)
        end
    end
end)
