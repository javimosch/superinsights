package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
)

const Version = "0.1.0"

type SIError struct {
	Code    int    `json:"code"`
	Type    string `json:"type"`
	Message string `json:"message"`
	Details struct {
		ProjectID string `json:"project_id,omitempty"`
		Reason    string `json:"reason,omitempty"`
	} `json:"details,omitempty"`
	Recoverable bool     `json:"recoverable"`
	RetryAfter  *int     `json:"retry_after,omitempty"`
	Suggestions []string `json:"suggestions,omitempty"`
}

func (e *SIError) Error() string {
	return e.Message
}

func fail(code int, err *SIError) {
	if jsonOutput {
		json.NewEncoder(os.Stdout).Encode(map[string]interface{}{
			"version": "1.0",
			"error":   err,
		})
	} else {
		fmt.Fprintln(os.Stderr, "Error:", err.Message)
		if len(err.Suggestions) > 0 {
			fmt.Fprintln(os.Stderr, "Suggestions:")
			for _, s := range err.Suggestions {
				fmt.Fprintln(os.Stderr, "  "+s)
			}
		}
	}
	os.Exit(code)
}

var jsonOutput bool

func main() {
	args := os.Args[1:]
	if len(args) == 0 {
		printUsage()
		os.Exit(0)
	}

	cmd := args[0]
	cmdArgs := args[1:]

	// Global flags
	for i, a := range cmdArgs {
		if a == "--json" {
			jsonOutput = true
			cmdArgs = append(cmdArgs[:i], cmdArgs[i+1:]...)
			break
		}
	}

	switch cmd {
	case "help", "--help", "-h":
		printUsage()
	case "--help-json":
		printHelpJSON()
	case "version", "--version", "-v":
		fmt.Println("si version", Version)
	case "projects":
		cmdProjects(cmdArgs)
	case "events":
		cmdEvents(cmdArgs)
	case "pageviews":
		cmdPageviews(cmdArgs)
	case "stats":
		cmdStats(cmdArgs)
	case "errors":
		cmdErrors(cmdArgs)
	case "autocapture":
		cmdAutocapture(cmdArgs)
	default:
		fail(80, &SIError{
			Code:    80,
			Type:    "unknown_command",
			Message: fmt.Sprintf("unknown command: %s", cmd),
			Suggestions: []string{
				"Run `si help` to see available commands",
				"Run `si --help-json` for machine-readable help",
			},
		})
	}
}

func printUsage() {
	fmt.Println(`si — SuperInsights CLI

Usage:
  si <command> [flags]

Commands:
  projects                     List projects
  events list [--event NAME]   List events (optional filter by event name)
  events get <id>              Get event detail
  pageviews                    Pageview stats
  errors                       Error aggregates
  stats                        Summary counts
  autocapture [--top]          Top autocaptured elements

Global flags:
  --json                       JSON output
  --api-url <url>              API base URL (env: SI_API_URL)
  --project <id>               Project ID (env: SI_PROJECT_ID)
  --token <token>              Public link token (env: SI_TOKEN)
  --timeframe <range>          Time range: 1h, 6h, 24h, 7d, 30d (default: 24h)

Environment:
  SI_API_URL    API base URL (default: https://superinsights.coolify.intrane.fr)
  SI_PROJECT_ID Project ID (required)
  SI_TOKEN      Public link token (required)

Exit codes:
  0             Success
  80            Invalid arguments
  85            Missing configuration
  90            Not found
  92            Resource not found
  100           API error
  105           Connection failed
  110           Internal error
`)
}

func printHelpJSON() {
	h := map[string]interface{}{
		"version": Version,
		"commands": map[string]interface{}{
			"projects": map[string]interface{}{
				"description": "List projects",
				"usage":       "si projects",
				"flags":       map[string]string{},
			},
			"events": map[string]interface{}{
				"description": "List events or get event detail",
				"usage":       "si events list [--event NAME]  |  si events get <id>",
				"flags": map[string]string{
					"--event": "Filter by event name (e.g., $click)",
				},
			},
			"pageviews": map[string]interface{}{
				"description": "Pageview analytics",
				"usage":       "si pageviews",
				"flags":       map[string]string{},
			},
			"errors": map[string]interface{}{
				"description": "Error aggregates",
				"usage":       "si errors",
				"flags":       map[string]string{},
			},
			"stats": map[string]interface{}{
				"description": "Summary counts across all data types",
				"usage":       "si stats",
				"flags":       map[string]string{},
			},
			"autocapture": map[string]interface{}{
				"description": "Top autocaptured elements ($click events)",
				"usage":       "si autocapture [--top]",
				"flags": map[string]string{
					"--top": "Show top clicked elements",
				},
			},
		},
		"global_flags": map[string]string{
			"--json":      "JSON output",
			"--api-url":   "API base URL (env: SI_API_URL)",
			"--project":   "Project ID (env: SI_PROJECT_ID)",
			"--token":     "Public link token (env: SI_TOKEN)",
			"--timeframe": "Time range: 1h, 6h, 24h, 7d, 30d",
		},
		"output_formats": []string{"text", "json"},
		"exit_codes": map[string]interface{}{
			"0":   "success",
			"80":  "invalid_argument",
			"85":  "missing_configuration",
			"90":  "not_found",
			"92":  "resource_not_found",
			"100": "api_error",
			"105": "connection_failed",
			"110": "internal_error",
		},
	}
	json.NewEncoder(os.Stdout).Encode(h)
}

func parseGlobalFlags(args []string) (apiURL, projectID, token, timeframe string, remaining []string) {
	apiURL = os.Getenv("SI_API_URL")
	projectID = os.Getenv("SI_PROJECT_ID")
	token = os.Getenv("SI_TOKEN")
	timeframe = "24h"

	if apiURL == "" {
		apiURL = "https://superinsights.coolify.intrane.fr"
	}

	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--api-url":
			if i+1 < len(args) {
				apiURL = args[i+1]
				i++
			}
		case "--project":
			if i+1 < len(args) {
				projectID = args[i+1]
				i++
			}
		case "--token":
			if i+1 < len(args) {
				token = args[i+1]
				i++
			}
		case "--timeframe":
			if i+1 < len(args) {
				timeframe = args[i+1]
				i++
			}
		default:
			remaining = append(remaining, args[i])
		}
	}
	return
}

func requireConfig(projectID, token string) {
	missing := []string{}
	if projectID == "" {
		missing = append(missing, "SI_PROJECT_ID (or --project)")
	}
	if token == "" {
		missing = append(missing, "SI_TOKEN (or --token)")
	}
	if len(missing) > 0 {
		fail(85, &SIError{
			Code:    85,
			Type:    "missing_configuration",
			Message: fmt.Sprintf("missing required configuration: %s", strings.Join(missing, ", ")),
			Suggestions: []string{
				"Set environment variables: export SI_PROJECT_ID=... SI_TOKEN=...",
				"Pass flags: si <cmd> --project <id> --token <token>",
				"Get project token from: Project Settings → Public Link",
			},
		})
	}
}

func printJSON(v interface{}) {
	out := map[string]interface{}{
		"version": "1.0",
		"data":    v,
	}
	json.NewEncoder(os.Stdout).Encode(out)
}

func printText(lines []string) {
	for _, l := range lines {
		fmt.Println(l)
	}
}
