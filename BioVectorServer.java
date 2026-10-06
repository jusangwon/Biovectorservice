import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.*;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * BioVector Studio - Standalone Java HTTP Server
 * 생명과학 연구실 전용 AI 벡터 변환 서비스 백엔드
 *
 * 순수 Java SE 표준 라이브러리만 사용 (외부 의존성 없음)
 *
 * To compile and run:
 *   javac BioVectorServer.java
 *   java BioVectorServer
 */
public class BioVectorServer {
    private static final int PORT = 8090;
    private static final String ROOT_DIR = System.getProperty("user.dir");
    private static final String OUTPUT_DIR = ROOT_DIR + File.separator + "output";

    public static void main(String[] args) throws IOException {
        int port = PORT;
        if (args.length > 0) {
            try { port = Integer.parseInt(args[0]); } catch (NumberFormatException ignored) {}
        }

        // output 폴더 생성 (없을 경우)
        new File(OUTPUT_DIR).mkdirs();

        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);

        // 정적 파일 핸들러
        server.createContext("/", new StaticFileHandler());

        // API: API 키 조회
        server.createContext("/api/key", new ApiKeyHandler());

        // API: 날짜 폴더 생성 및 SVG 파일 저장
        server.createContext("/api/save-vectors", new SaveVectorsHandler());

        // API: output 폴더 리스트 조회
        server.createContext("/api/list-outputs", new ListOutputsHandler());

        // API: 헬스 체크
        server.createContext("/api/health", exchange -> {
            byte[] response = "{\"status\":\"ok\",\"service\":\"BioVector Studio\"}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
            exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
            exchange.sendResponseHeaders(200, response.length);
            try (OutputStream os = exchange.getResponseBody()) { os.write(response); }
        });

        server.setExecutor(null);
        server.start();

        System.out.println("==========================================================");
        System.out.println("  BioVector Studio - AI 벡터 변환 서버 시작");
        System.out.println("  로컬 주소  : http://localhost:" + port + "/");
        System.out.println("  출력 폴더  : " + OUTPUT_DIR);
        System.out.println("  API Key  : " + new File(ROOT_DIR, "apikey/key.txt").getAbsolutePath());
        System.out.println("  서버 종료  : Ctrl + C");
        System.out.println("==========================================================");

        // 브라우저 자동 실행
        try {
            String os = System.getProperty("os.name").toLowerCase();
            if (os.contains("win")) {
                Runtime.getRuntime().exec("cmd /c start http://localhost:" + port + "/");
            }
        } catch (Exception e) {
            System.out.println("  브라우저 자동 실행 실패: " + e.getMessage());
        }
    }

    // 정적 파일 핸들러
    static class StaticFileHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String path = exchange.getRequestURI().getPath();
            if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
            path = path.replace("..", "");

            File file = new File(ROOT_DIR, path);

            if (!file.exists() || file.isDirectory()) {
                byte[] body = ("404 Not Found: " + path).getBytes(StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(404, body.length);
                try (OutputStream os = exchange.getResponseBody()) { os.write(body); }
                return;
            }

            String mime = getMimeType(file.getName());
            exchange.getResponseHeaders().set("Content-Type", mime);
            exchange.getResponseHeaders().set("Cache-Control", "no-cache");
            exchange.sendResponseHeaders(200, file.length());
            try (OutputStream os = exchange.getResponseBody();
                 FileInputStream fis = new FileInputStream(file)) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = fis.read(buf)) != -1) os.write(buf, 0, n);
            }
        }

        private String getMimeType(String name) {
            if (name.endsWith(".html")) return "text/html; charset=UTF-8";
            if (name.endsWith(".css"))  return "text/css; charset=UTF-8";
            if (name.endsWith(".js"))   return "application/javascript; charset=UTF-8";
            if (name.endsWith(".svg"))  return "image/svg+xml; charset=UTF-8";
            if (name.endsWith(".json")) return "application/json; charset=UTF-8";
            if (name.endsWith(".png"))  return "image/png";
            if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
            return "application/octet-stream";
        }
    }

    // API 키 핸들러
    static class ApiKeyHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            setCorsHeaders(exchange);
            if ("OPTIONS".equals(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(204, -1);
                return;
            }
            File keyFile = new File(ROOT_DIR, "apikey/key.txt");
            String key = "";
            boolean found = false;
            if (keyFile.exists()) {
                try {
                    key = new String(Files.readAllBytes(keyFile.toPath()), StandardCharsets.UTF_8).trim();
                    found = !key.isEmpty();
                } catch (Exception ignored) {}
            }
            String json = "{\"found\":" + found + ",\"key\":\"" + key + "\"}";
            byte[] response = json.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
            exchange.sendResponseHeaders(200, response.length);
            try (OutputStream os = exchange.getResponseBody()) { os.write(response); }
        }
    }

    // SVG 저장 핸들러 (날짜별 폴더 자동 생성)
    static class SaveVectorsHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            setCorsHeaders(exchange);
            if ("OPTIONS".equals(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(204, -1);
                return;
            }
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(405, -1);
                return;
            }

            String body;
            try (InputStream is = exchange.getRequestBody()) {
                body = new String(is.readAllBytes(), StandardCharsets.UTF_8);
            }

            try {
                String keyword  = extractJsonStringUtil(body, "keyword");
                String svgArray = extractJsonArrayRaw(body, "svgs");

                String timestamp  = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd_HHmmss"));
                String safeKeyword = keyword.replaceAll("[^a-zA-Z0-9가-힣_\\-]", "_");
                if (safeKeyword.length() > 30) safeKeyword = safeKeyword.substring(0, 30);
                String folderName  = timestamp + "_" + safeKeyword;
                File outputFolder  = new File(OUTPUT_DIR, folderName);
                outputFolder.mkdirs();

                List<String> savedFiles = new ArrayList<>();
                List<Map<String, String>> svgItems = parseSvgArray(svgArray);

                for (int i = 0; i < svgItems.size(); i++) {
                    Map<String, String> item = svgItems.get(i);
                    String name     = item.getOrDefault("name", "entity_" + i);
                    String svgCode  = item.getOrDefault("svg", "");
                    String fileName = String.format("%02d_%s.svg", i + 1,
                        name.replaceAll("[^a-zA-Z0-9가-힣_\\-]", "_"));
                    Files.write(new File(outputFolder, fileName).toPath(),
                        svgCode.getBytes(StandardCharsets.UTF_8));
                    savedFiles.add(fileName);
                }

                // metadata.json 저장
                StringBuilder meta = new StringBuilder("{\n");
                meta.append("  \"keyword\": \"").append(escapeJson(keyword)).append("\",\n");
                meta.append("  \"created\": \"").append(LocalDateTime.now()).append("\",\n");
                meta.append("  \"folder\": \"").append(escapeJson(folderName)).append("\",\n");
                meta.append("  \"entities\": [\n");
                for (int i = 0; i < svgItems.size(); i++) {
                    Map<String, String> item = svgItems.get(i);
                    meta.append("    {\"name\": \"").append(escapeJson(item.getOrDefault("name",""))).append("\", ");
                    meta.append("\"description\": \"").append(escapeJson(item.getOrDefault("description",""))).append("\", ");
                    meta.append("\"category\": \"").append(escapeJson(item.getOrDefault("category",""))).append("\"}");
                    if (i < svgItems.size() - 1) meta.append(",");
                    meta.append("\n");
                }
                meta.append("  ]\n}\n");
                Files.write(new File(outputFolder, "metadata.json").toPath(),
                    meta.toString().getBytes(StandardCharsets.UTF_8));

                String responseJson = "{\"success\":true,\"folder\":\""
                    + escapeJson(outputFolder.getAbsolutePath()) + "\",\"folderName\":\""
                    + escapeJson(folderName) + "\",\"count\":" + savedFiles.size() + "}";
                byte[] resp = responseJson.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
                exchange.sendResponseHeaders(200, resp.length);
                try (OutputStream os = exchange.getResponseBody()) { os.write(resp); }

            } catch (Exception e) {
                String err = "{\"success\":false,\"error\":\"" + escapeJson(e.getMessage()) + "\"}";
                byte[] resp = err.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
                exchange.sendResponseHeaders(500, resp.length);
                try (OutputStream os = exchange.getResponseBody()) { os.write(resp); }
            }
        }

        private List<Map<String, String>> parseSvgArray(String raw) {
            List<Map<String, String>> result = new ArrayList<>();
            if (raw == null || raw.isBlank()) return result;
            String content = raw.trim();
            if (content.startsWith("[")) content = content.substring(1);
            if (content.endsWith("]"))   content = content.substring(0, content.length() - 1);
            int depth = 0, start = -1;
            for (int i = 0; i < content.length(); i++) {
                char c = content.charAt(i);
                if (c == '{') { if (depth == 0) start = i; depth++; }
                else if (c == '}') {
                    depth--;
                    if (depth == 0 && start != -1) {
                        String obj = content.substring(start, i + 1);
                        Map<String, String> map = new LinkedHashMap<>();
                        map.put("name",        extractJsonStringUtil(obj, "name"));
                        map.put("description", extractJsonStringUtil(obj, "description"));
                        map.put("category",    extractJsonStringUtil(obj, "category"));
                        map.put("svg",         extractSvgString(obj));
                        result.add(map);
                        start = -1;
                    }
                }
            }
            return result;
        }

        /** SVG 코드는 <svg...>...</svg> 태그 전체를 추출 */
        private String extractSvgString(String obj) {
            int s = obj.indexOf("<svg");
            if (s < 0) return extractJsonStringUtil(obj, "svg");
            int e = obj.lastIndexOf("</svg>");
            if (e < 0) return extractJsonStringUtil(obj, "svg");
            return obj.substring(s, e + 6).replace("\\n", "\n").replace("\\\"", "\"");
        }

        private String extractJsonArrayRaw(String json, String key) {
            String pattern = "\"" + key + "\"";
            int idx = json.indexOf(pattern);
            if (idx < 0) return "[]";
            int colon  = json.indexOf(":", idx + pattern.length());
            if (colon < 0) return "[]";
            int bracketOpen = json.indexOf("[", colon + 1);
            if (bracketOpen < 0) return "[]";
            int depth = 0, i = bracketOpen;
            for (; i < json.length(); i++) {
                char c = json.charAt(i);
                if (c == '[') depth++;
                else if (c == ']') { depth--; if (depth == 0) break; }
            }
            return json.substring(bracketOpen, i + 1);
        }

        private String escapeJson(String s) {
            if (s == null) return "";
            return s.replace("\\","\\\\").replace("\"","\\\"").replace("\n","\\n").replace("\r","");
        }
    }

    // output 폴더 목록 핸들러
    static class ListOutputsHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            setCorsHeaders(exchange);
            File outDir = new File(OUTPUT_DIR);
            File[] dirs = outDir.listFiles(File::isDirectory);
            StringBuilder sb = new StringBuilder("[");
            if (dirs != null) {
                Arrays.sort(dirs, Comparator.comparing(File::getName).reversed());
                for (int i = 0; i < dirs.length; i++) {
                    if (i > 0) sb.append(",");
                    sb.append("{\"name\":\"").append(dirs[i].getName())
                      .append("\",\"path\":\"")
                      .append(dirs[i].getAbsolutePath().replace("\\","\\\\")).append("\"}");
                }
            }
            sb.append("]");
            byte[] resp = sb.toString().getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
            exchange.sendResponseHeaders(200, resp.length);
            try (OutputStream os = exchange.getResponseBody()) { os.write(resp); }
        }
    }

    private static void setCorsHeaders(HttpExchange exchange) {
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");
    }

    private static String extractJsonStringUtil(String json, String key) {
        String pattern = "\"" + key + "\"";
        int idx = json.indexOf(pattern);
        if (idx < 0) return "";
        int colon  = json.indexOf(":", idx + pattern.length());
        if (colon < 0) return "";
        int quote1 = json.indexOf("\"", colon + 1);
        if (quote1 < 0) return "";
        int quote2 = quote1 + 1;
        while (quote2 < json.length()) {
            if (json.charAt(quote2) == '"' && json.charAt(quote2 - 1) != '\\') break;
            quote2++;
        }
        return json.substring(quote1 + 1, quote2)
            .replace("\\n","\n").replace("\\\"","\"").replace("\\\\","\\");
    }
}
